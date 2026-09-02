import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface VisualizationErrorBoundaryProps {
  children: React.ReactNode;
  className?: string;
}

interface VisualizationErrorBoundaryState {
  failed: boolean;
}

export class VisualizationErrorBoundary extends React.Component<
  VisualizationErrorBoundaryProps,
  VisualizationErrorBoundaryState
> {
  state: VisualizationErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): VisualizationErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('[visualization] 3D preview unavailable:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className={`flex h-full min-h-[240px] items-center justify-center bg-[#F5F5F0] p-8 ${this.props.className || ''}`}>
        <div className="max-w-sm text-center">
          <AlertCircle className="mx-auto h-7 w-7 text-[#86868b]" />
          <p className="mt-3 text-sm font-semibold text-[#1d1d1f]">3D preview currently unavailable</p>
          <p className="mt-1 text-xs leading-5 text-[#6e6e73]">
            Please enable browser WebGL or hardware acceleration. Structure data and compute Agent will not be affected.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            className="apple-button-secondary mx-auto mt-4"
          >
            <RefreshCw size={13} />
            Retry Preview
          </button>
        </div>
      </div>
    );
  }
}
