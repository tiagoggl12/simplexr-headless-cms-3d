import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  File,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  Sparkles,
  FolderOpen,
} from 'lucide-react';
import { uploadsApi, assetsApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface UploadFile {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
  assetId?: string;
}

const ALLOWED_EXTENSIONS = ['.glb', '.gltf'];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export function Uploads() {
  const navigate = useNavigate();
  const toast = useToast();
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFiles = (files: File[]): { valid: File[]; invalid: { file: File; reason: string }[] } => {
    const valid: File[] = [];
    const invalid: { file: File; reason: string }[] = [];

    files.forEach((file) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        invalid.push({ file, reason: 'Extensão não permitida' });
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        invalid.push({ file, reason: 'Arquivo muito grande (max 100MB)' });
        return;
      }
      valid.push(file);
    });

    return { valid, invalid };
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      const { valid, invalid } = validateFiles(files);

      if (invalid.length > 0) {
        invalid.forEach(({ file, reason }) => {
          toast.addToast(`${file.name}: ${reason}`, 'error');
        });
      }

      if (valid.length > 0) {
        addFiles(valid);
      }
    },
    [toast]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const { valid, invalid } = validateFiles(files);

    if (invalid.length > 0) {
      invalid.forEach(({ file, reason }) => {
        toast.addToast(`${file.name}: ${reason}`, 'error');
      });
    }

    if (valid.length > 0) {
      addFiles(valid);
    }

    e.target.value = '';
  };

  const addFiles = (files: File[]) => {
    const newUploads: UploadFile[] = files.map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: 'idle',
      progress: 0,
    }));

    setUploads((prev) => [...prev, ...newUploads]);
  };

  const removeUpload = (id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  };

  const uploadFile = async (upload: UploadFile): Promise<string> => {
    setUploads((prev) =>
      prev.map((u) =>
        u.id === upload.id ? { ...u, status: 'uploading' as UploadStatus, progress: 10 } : u
      )
    );

    try {
      // Get presigned URL
      const fileName = `${Date.now()}-${upload.file.name}`;
      const { uploadUrl, fileUrl } = await uploadsApi.presign(fileName);

      setUploads((prev) =>
        prev.map((u) => (u.id === upload.id ? { ...u, progress: 30 } : u))
      );

      // Upload to storage
      await fetch(uploadUrl, {
        method: 'PUT',
        body: upload.file,
        headers: {
          'Content-Type': upload.file.type || 'model/gltf-binary',
        },
      });

      setUploads((prev) =>
        prev.map((u) => (u.id === upload.id ? { ...u, progress: 70 } : u))
      );

      // Create asset
      const assetName = upload.file.name.replace(/\.(glb|gltf)$/i, '');
      const asset = await assetsApi.create({
        name: assetName,
        masterUrl: fileUrl,
      });

      setUploads((prev) =>
        prev.map((u) =>
          u.id === upload.id ? { ...u, status: 'success' as UploadStatus, progress: 100, assetId: asset.id } : u
        )
      );

      return asset.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploads((prev) =>
        prev.map((u) =>
          u.id === upload.id ? { ...u, status: 'error' as UploadStatus, error: message } : u
        )
      );
      throw error;
    }
  };

  const uploadAll = async () => {
    const pending = uploads.filter((u) => u.status === 'idle');
    if (pending.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const upload of pending) {
      try {
        await uploadFile(upload);
        successCount++;
      } catch {
        errorCount++;
      }
    }

    setIsUploading(false);

    if (successCount > 0) {
      toast.addToast(`${successCount} arquivo(s) enviado(s) com sucesso`, 'success');
    }
    if (errorCount > 0) {
      toast.addToast(`${errorCount} arquivo(s) falharam`, 'error');
    }
  };

  const clearCompleted = () => {
    setUploads((prev) => prev.filter((u) => u.status !== 'success'));
  };

  const pendingCount = uploads.filter((u) => u.status === 'idle').length;
  const completedCount = uploads.filter((u) => u.status === 'success').length;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Upload de Modelos 3D</h1>
        <p className="text-gray-500 mt-2">
          Arraste e solte seus arquivos GLB ou GLTF para adicionar à sua biblioteca
        </p>
      </div>

      {/* Upload Zone */}
      <Card>
        <CardContent className="p-8">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300',
              isDragging
                ? 'border-primary bg-primary/5 scale-[1.02]'
                : 'border-gray-300 hover:border-gray-400'
            )}
          >
            <input
              type="file"
              accept=".glb,.gltf"
              multiple
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                <UploadCloud className="w-8 h-8 text-gray-400" />
              </div>
              <div>
                <p className="text-lg font-medium text-gray-900">
                  Arraste seus arquivos aqui
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  ou clique para navegar em seus arquivos
                </p>
              </div>
              <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
                <span>GLB • GLTF</span>
                <span>•</span>
                <span>até 100MB</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Queue */}
      {uploads.length > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Arquivos na Fila</h2>
                <p className="text-sm text-gray-500">
                  {uploads.length} arquivo(s) • {pendingCount} pendente(s)
                </p>
              </div>
              <div className="flex items-center gap-2">
                {completedCount > 0 && (
                  <Button variant="secondary" size="sm" onClick={clearCompleted}>
                    Limpar concluídos
                  </Button>
                )}
                {pendingCount > 0 && (
                  <Button onClick={uploadAll} disabled={isUploading}>
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4" />
                        Enviar {pendingCount} arquivo(s)
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {uploads.map((upload) => (
                <div
                  key={upload.id}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl"
                >
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <File className="w-5 h-5 text-gray-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {upload.file.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatFileSize(upload.file.size)}
                    </p>

                    {upload.status === 'uploading' && (
                      <div className="mt-2">
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-300"
                            style={{ width: `${upload.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {upload.status === 'idle' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => removeUpload(upload.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}

                    {upload.status === 'uploading' && (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    )}

                    {upload.status === 'success' && (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        {upload.assetId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/assets/${upload.assetId}`)}
                          >
                            Ver asset
                          </Button>
                        )}
                      </div>
                    )}

                    {upload.status === 'error' && (
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                        <span className="text-sm text-red-600">{upload.error}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeUpload(upload.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats / Help */}
      {uploads.length === 0 && (
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <FolderOpen className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <h3 className="font-medium text-gray-900 mb-2">
                Nenhum arquivo selecionado
              </h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Selecione arquivos GLB ou GLTF do seu computador para fazer upload.
                Os arquivos serão processados e estarão disponíveis na sua biblioteca
                após o upload.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
