import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, GizmoHelper, GizmoViewport, useGLTF } from '@react-three/drei';
import { Button } from './ui/Button.js';
import { Grid3X3, Box, RotateCw } from 'lucide-react';

interface ModelViewerProps {
  glbUrl: string;
  className?: string;
  showGrid?: boolean;
  showGizmo?: boolean;
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

interface ViewerControlsProps {
  onToggleGrid: () => void;
  onResetCamera: () => void;
}

function ViewerControls({ onToggleGrid, onResetCamera }: ViewerControlsProps) {
  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={onToggleGrid}
        title="Toggle Grid"
      >
        <Grid3X3 className="w-4 h-4" />
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={onResetCamera}
        title="Reset Camera"
      >
        <RotateCw className="w-4 h-4" />
      </Button>
    </div>
  );
}

export function ModelViewer({
  glbUrl,
  className,
  showGrid: initialShowGrid = true,
  showGizmo = true,
}: ModelViewerProps) {
  const [showGrid, setShowGrid] = useState(initialShowGrid);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
  }, [glbUrl]);

  const handleResetCamera = () => {
    // Camera reset will be handled by OrbitControls
  };

  if (!glbUrl) {
    return (
      <div className={className}>
        <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
          <div className="text-center text-gray-500">
            <Box className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No model URL provided</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
          <div className="text-center text-red-500">
            <p>Failed to load model</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="relative w-full h-full bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg overflow-hidden">
        <ViewerControls
          onToggleGrid={() => setShowGrid(!showGrid)}
          onResetCamera={handleResetCamera}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
            <div className="text-center text-white">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading model...</p>
            </div>
          </div>
        )}

        <Canvas
          camera={{ position: [5, 5, 5], fov: 45 }}
          shadows
          gl={{ antialias: true, alpha: true }}
          onCreated={() => setIsLoading(false)}
          onError={(err) => {
            console.error('Canvas error:', err);
            setError('Failed to initialize viewer');
            setIsLoading(false);
          }}
        >
          <Suspense fallback={null}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} castShadow />

            {showGrid && (
              <Grid
                args={[20, 20]}
                cellSize={1}
                cellThickness={0.5}
                cellColor="#6b7280"
                sectionSize={5}
                sectionThickness={1}
                sectionColor="#9ca3af"
                fadeDistance={30}
                fadeStrength={1}
                followCamera={false}
                infiniteGrid
              />
            )}

            {/* Load the model */}
            <group>
              <Model url={glbUrl} />
            </group>

            {/* Environment based on lighting preset or default */}
            <Environment preset="city" background={false} />

            {showGizmo && (
              <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                <GizmoViewport
                  axisColors={['#ef4444', '#22c55e', '#3b82f6']}
                  labelColor="white"
                />
              </GizmoHelper>
            )}
          </Suspense>

          <OrbitControls
            makeDefault
            minPolarAngle={0}
            maxPolarAngle={Math.PI}
            minDistance={1}
            maxDistance={50}
            enableDamping
            dampingFactor={0.05}
          />
        </Canvas>
      </div>
    </div>
  );
}
