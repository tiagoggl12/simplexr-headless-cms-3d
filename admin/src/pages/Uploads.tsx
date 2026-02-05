import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, File, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { uploadsApi, assetsApi } from '@/lib/api.js';
import { Button } from '@/components/ui/Button.js';
import { Input } from '@/components/ui/Input.js';
import { Card, CardContent } from '@/components/ui/Card.js';
import { useToast } from '@/components/ui/Toast.js';
import { cn } from '@/lib/utils.js';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface UploadFile {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
  assetUrl?: string;
  assetId?: string;
}

export function Uploads() {
  const navigate = useNavigate();
  const toast = useToast();
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [assetName, setAssetName] = useState('');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(
      (file) => file.name.toLowerCase().endsWith('.glb')
    );

    if (files.length === 0) {
      toast.addToast('Please drop .glb files only', 'error');
      return;
    }

    addFiles(files);
  }, [toast]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const glbFiles = files.filter((file) =>
      file.name.toLowerCase().endsWith('.glb')
    );

    if (glbFiles.length === 0) {
      toast.addToast('Please select .glb files only', 'error');
      return;
    }

    addFiles(glbFiles);
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

  const uploadFile = async (upload: UploadFile) => {
    setUploads((prev) =>
      prev.map((u) =>
        u.id === upload.id ? { ...u, status: 'uploading' as UploadStatus } : u
      )
    );

    try {
      // Get presigned URL
      const fileName = `${Date.now()}-${upload.file.name}`;
      const { uploadUrl, fileUrl } = await uploadsApi.presign(fileName);

      // Upload to storage
      await fetch(uploadUrl, {
        method: 'PUT',
        body: upload.file,
        headers: {
          'Content-Type': upload.file.type || 'model/gltf-binary',
        },
      });

      setUploads((prev) =>
        prev.map((u) =>
          u.id === upload.id ? { ...u, progress: 100, assetUrl: fileUrl } : u
        )
      );

      // Create asset
      const assetNameValue = assetName || upload.file.name.replace('.glb', '');
      const asset = await assetsApi.create({
        name: assetNameValue,
        masterUrl: fileUrl,
      });

      setUploads((prev) =>
        prev.map((u) =>
          u.id === upload.id
            ? { ...u, status: 'success' as UploadStatus, assetId: asset.id }
            : u
        )
      );

      toast.addToast(`Successfully uploaded ${upload.file.name}`, 'success');
      setAssetName('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploads((prev) =>
        prev.map((u) =>
          u.id === upload.id ? { ...u, status: 'error' as UploadStatus, error: message } : u
        )
      );
      toast.addToast(`Failed to upload ${upload.file.name}`, 'error');
    }
  };

  const uploadAll = () => {
    uploads.forEach((upload) => {
      if (upload.status === 'idle') {
        uploadFile(upload);
      }
    });
  };

  const clearCompleted = () => {
    setUploads((prev) => prev.filter((u) => u.status === 'idle' || u.status === 'uploading'));
  };

  const pendingCount = uploads.filter((u) => u.status === 'idle').length;
  const completedCount = uploads.filter((u) => u.status === 'success').length;
  const errorCount = uploads.filter((u) => u.status === 'error').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upload 3D Models</h1>
        <p className="text-gray-500 mt-1">
          Upload GLB files to create new 3D assets in your library.
        </p>
      </div>

      {/* Upload Zone */}
      <Card>
        <CardContent className="p-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'border-2 border-dashed rounded-xl p-12 text-center transition-colors',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-gray-300 hover:border-gray-400'
            )}
          >
            <UploadCloud className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Drag & drop GLB files here
            </h3>
            <p className="text-gray-500 mb-4">or click to browse your files</p>
            <label>
              <input
                type="file"
                accept=".glb"
                multiple
                onChange={handleFileInput}
                className="hidden"
              />
              <span className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors bg-primary text-white hover:bg-primary-dark cursor-pointer">
                Select Files
              </span>
            </label>
          </div>

          {/* Asset Name Input */}
          {uploads.length > 0 && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Asset Name (optional)
              </label>
              <Input
                placeholder="Leave empty to use filename"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                This name will be used for all uploads in this batch
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uploads Queue */}
      {uploads.length > 0 && (
        <Card>
          <div className="flex flex-row items-center justify-between p-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">Upload Queue ({uploads.length})</h3>
            <div className="flex items-center gap-2">
              {completedCount > 0 && (
                <Button variant="secondary" size="sm" onClick={clearCompleted}>
                  Clear Completed
                </Button>
              )}
              {pendingCount > 0 && (
                <Button onClick={uploadAll}>
                  <UploadCloud className="w-4 h-4" />
                  Upload {pendingCount} File{pendingCount > 1 ? 's' : ''}
                </Button>
              )}
            </div>
          </div>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {uploads.map((upload) => (
                <div key={upload.id} className="p-4 flex items-center gap-4">
                  <File className="w-8 h-8 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {upload.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(upload.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    {upload.status === 'uploading' && (
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all"
                          style={{ width: `${upload.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {upload.status === 'idle' && (
                      <Button size="sm" onClick={() => uploadFile(upload)}>
                        Upload
                      </Button>
                    )}
                    {upload.status === 'uploading' && (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    )}
                    {upload.status === 'success' && (
                      <>
                        <Check className="w-5 h-5 text-green-500" />
                        {upload.assetId && (
                          <button
                            onClick={() => navigate(`/assets/${upload.assetId}`)}
                            className="text-sm text-primary hover:text-primary-dark"
                          >
                            View
                          </button>
                        )}
                      </>
                    )}
                    {upload.status === 'error' && (
                      <div className="flex items-center gap-2 text-red-500">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-xs">{upload.error}</span>
                      </div>
                    )}
                    <button
                      onClick={() => removeUpload(upload.id)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {(completedCount > 0 || errorCount > 0) && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              {completedCount > 0 && (
                <div className="flex items-center gap-2 text-green-600">
                  <Check className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    {completedCount} uploaded successfully
                  </span>
                </div>
              )}
              {errorCount > 0 && (
                <div className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    {errorCount} failed
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
