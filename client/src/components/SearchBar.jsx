// ============================================================
//  src/components/SearchBar.jsx
//  Search input for the dashboard — filters both the personal
//  and shared file sections. Presentational only: the debounce
//  and the actual search request live in Dashboard.jsx.
// ============================================================

import React, { useRef } from 'react';
import { SearchIcon, CloseIcon } from './Icons';

/**
 * @param {string}   value     - current query text (controlled)
 * @param {Function} onChange  - called with the new string on every keystroke
 * @param {Function} onClear   - called when the clear (×) button is pressed
 * @param {Function} onSubmit  - called when the user presses Enter (search immediately)
 */
const SearchBar = ({ value, onChange, onClear, onSubmit }) => {
  const inputRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
      inputRef.current?.blur();   // unfocus after an explicit search
    }
  };

  return (
    <div className="search-bar">
      <span className="search-bar__icon" aria-hidden="true">
        <SearchIcon />
      </span>
      <input
        ref={inputRef}
        type="text"
        className="search-bar__input"
        placeholder="Search files and folders…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search files and folders"
      />
      {value && (
        <button
          type="button"
          className="search-bar__clear"
          aria-label="Clear search"
          onClick={onClear}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
};

export default SearchBar;
