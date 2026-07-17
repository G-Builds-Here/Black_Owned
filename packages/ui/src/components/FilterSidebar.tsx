import React from 'react';
import styles from './FilterSidebar.module.css';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterSidebarProps {
  title?: string;
  options: FilterOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  title = 'Filters',
  options,
  selectedValues,
  onChange,
}) => {
  const handleToggle = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  return (
    <aside className={styles.filterSidebar} aria-label={title}>
      <span className={styles.filterTitle}>{title}</span>
      <ul className={styles.filterOptions}>
        {options.map((option) => (
          <li key={option.value}>
            <label>
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                onChange={() => handleToggle(option.value)}
              />
              <span>{option.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default FilterSidebar;
