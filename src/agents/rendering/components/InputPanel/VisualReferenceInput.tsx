/**
 * VisualReferenceInput.tsx — Section B: Visual Reference Input
 * Reference images, base structure images, style references
 */

import React, { useRef } from 'react';
import { ImagePlus, X, Layers, Palette } from 'lucide-react';

interface VisualReferenceInputProps {
  referenceImages: File[];
  onReferenceImagesChange: (files: File[]) => void;
  structureBaseImage: File | null;
  onStructureBaseImageChange: (file: File | null) => void;
}

const ImagePreview: React.FC<{ file: File; onRemove: () => void }> = ({ file, onRemove }) => {
  const url = React.useMemo(() => URL.createObjectURL(file), [file]);
  React.useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <div className="relative group w-20 h-20 rounded-[12px] overflow-hidden border border-gray-100 shadow-sm">
      <img src={url} alt={file.name} className="w-full h-full object-cover" />
      <button
        onClick={onRemove}
        className="
          absolute top-1 right-1 w-5 h-5
          bg-black/50 rounded-full flex items-center justify-center
          opacity-0 group-hover:opacity-100
          transition-opacity duration-150
        "
      >
        <X size={10} className="text-white" />
      </button>
      <div className="absolute bottom-0 inset-x-0 bg-black/40 py-0.5 px-1">
        <p className="text-[8px] text-white truncate">{file.name}</p>
      </div>
    </div>
  );
};

const VisualReferenceInput: React.FC<VisualReferenceInputProps> = ({
  referenceImages,
  onReferenceImagesChange,
  structureBaseImage,
  onStructureBaseImageChange,
}) => {
  const refInputRef = useRef<HTMLInputElement>(null);
  const baseInputRef = useRef<HTMLInputElement>(null);

  const handleRefAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = [...referenceImages, ...Array.from(files)].slice(0, 5);
      onReferenceImagesChange(newFiles);
    }
    e.target.value = '';
  };

  const handleRefRemove = (index: number) => {
    const next = [...referenceImages];
    next.splice(index, 1);
    onReferenceImagesChange(next);
  };

  const handleBaseSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onStructureBaseImageChange(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
          B · Visual Reference
        </p>
        <p className="text-xs text-gray-500">
          Upload reference images, style guides, or structure base images from SciVisualizer.
        </p>
      </div>

      {/* Reference Images */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Palette size={12} className="text-gray-400" />
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Style & Color Reference (max 5)
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {referenceImages.map((file, i) => (
            <ImagePreview key={i} file={file} onRemove={() => handleRefRemove(i)} />
          ))}
          {referenceImages.length < 5 && (
            <button
              onClick={() => refInputRef.current?.click()}
              className="
                w-20 h-20 rounded-[12px]
                border-2 border-dashed border-gray-200
                flex flex-col items-center justify-center gap-1
                hover:border-gray-300 hover:bg-gray-50
                transition-all duration-150 group cursor-pointer
              "
            >
              <ImagePlus size={16} className="text-gray-300 group-hover:text-gray-400" strokeWidth={1.5} />
              <span className="text-[9px] text-gray-300 group-hover:text-gray-400">Add</span>
            </button>
          )}
        </div>
        <input
          ref={refInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleRefAdd}
          className="hidden"
        />
      </div>

      {/* Structure Base Image */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Layers size={12} className="text-gray-400" />
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Structure Base Image (optional)
          </span>
        </div>
        {structureBaseImage ? (
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-[16px]">
            <div className="w-12 h-12 rounded-[10px] overflow-hidden border border-blue-200 flex-shrink-0">
              <ImagePreviewSmall file={structureBaseImage} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#0A1128] truncate">{structureBaseImage.name}</p>
              <p className="text-[10px] text-blue-500 mt-0.5">
                Will be used as compositional constraint for generation
              </p>
            </div>
            <button
              onClick={() => onStructureBaseImageChange(null)}
              className="flex-shrink-0 w-7 h-7 rounded-full bg-white flex items-center justify-center hover:bg-gray-100 transition-colors"
            >
              <X size={12} className="text-gray-500" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => baseInputRef.current?.click()}
            className="
              w-full flex items-center gap-3 p-4
              border-2 border-dashed border-gray-200
              rounded-[16px] cursor-pointer
              hover:border-gray-300 hover:bg-gray-50
              transition-all duration-150 group
            "
          >
            <Layers size={18} className="text-gray-300 group-hover:text-gray-400" strokeWidth={1.5} />
            <div className="text-left">
              <p className="text-xs font-medium text-gray-400 group-hover:text-gray-500">
                Upload white-model / skeleton from SciVisualizer
              </p>
              <p className="text-[10px] text-gray-300 mt-0.5">
                PNG / JPG · This constrains the base composition
              </p>
            </div>
          </button>
        )}
        <input
          ref={baseInputRef}
          type="file"
          accept="image/*"
          onChange={handleBaseSelect}
          className="hidden"
        />
      </div>
    </div>
  );
};

// Small preview for base image
const ImagePreviewSmall: React.FC<{ file: File }> = ({ file }) => {
  const url = React.useMemo(() => URL.createObjectURL(file), [file]);
  React.useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt={file.name} className="w-full h-full object-cover" />;
};

export default VisualReferenceInput;
