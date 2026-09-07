import React from 'react';

export type SourceFilterValue = 'all' | 'google_maps' | 'yelp' | 'facebook';

interface SourceFilterProps {
  selectedSource: SourceFilterValue;
  onSourceChange: (source: SourceFilterValue) => void;
}

export const SourceFilter: React.FC<SourceFilterProps> = ({ selectedSource, onSourceChange }) => {
  const sources: { key: SourceFilterValue; label: string }[] = [
    { key: 'all', label: 'All Sources' },
    { key: 'google_maps', label: 'Google Maps' },
    { key: 'yelp', label: 'Yelp' },
    { key: 'facebook', label: 'Facebook' },
  ];

  return (
    <div className="flex gap-2">
      {sources.map((source) => (
        <button
          key={source.key}
          onClick={() => onSourceChange(source.key)}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            selectedSource === source.key
              ? 'bg-heritage-royal text-white'
              : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
          }`}
        >
          {source.label}
        </button>
      ))}
    </div>
  );
};
