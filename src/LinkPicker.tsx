import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TrackerItemResult {
  id: string;
  issueKey?: string;
  title: string;
  type?: string;
  status?: string;
  archived?: boolean;
}

interface FileResult {
  path: string;
  type?: string;
}

interface LinkOption {
  id: string;
  kind: 'tracker' | 'document' | 'url';
  value: string;
  title: string;
  detail: string;
}

interface ElectronApi {
  invoke?(channel: string, ...args: unknown[]): Promise<unknown>;
  buildQuickOpenCache?(workspacePath: string): Promise<{ success: boolean; fileCount?: number; error?: string }>;
  searchWorkspaceFileNames?(
    workspacePath: string,
    query: string,
    options?: { fileMask?: string | null },
  ): Promise<FileResult[]>;
  openExternal?(url: string): Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronApi;
  }
}

export interface LinkPickerProps {
  value: string;
  workspacePath?: string;
  onChange(value: string): void;
}

const workspaceCacheWarmups = new Map<string, Promise<void>>();

function ensureWorkspaceFileCache(api: ElectronApi, workspacePath: string): Promise<void> {
  const existing = workspaceCacheWarmups.get(workspacePath);
  if (existing) return existing;
  const warmup = (api.buildQuickOpenCache?.(workspacePath) ?? Promise.resolve({ success: true }))
    .then(() => undefined)
    .catch((error) => {
      workspaceCacheWarmups.delete(workspacePath);
      throw error;
    });
  workspaceCacheWarmups.set(workspacePath, warmup);
  return warmup;
}

export function trackerReferenceFromLink(value: string): string | null {
  const match = value.trim().match(/^nimbalyst:\/\/(?:tracker\/)?(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function trackerLink(referenceKey: string): string {
  return `nimbalyst://${referenceKey.trim()}`;
}

export function workspaceRelativePath(filePath: string, workspacePath?: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const root = workspacePath?.replace(/\\/g, '/').replace(/\/$/, '');
  if (root && normalized.startsWith(`${root}/`)) return normalized.slice(root.length + 1);
  return normalized;
}

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath;
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function LinkPicker({ value, workspacePath, onChange }: LinkPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [trackers, setTrackers] = useState<TrackerItemResult[]>([]);
  const [files, setFiles] = useState<FileResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    if (!open || !window.electronAPI?.invoke) return;
    let cancelled = false;
    window.electronAPI.invoke('document-service:tracker-items-list')
      .then((result) => {
        if (!cancelled && Array.isArray(result)) setTrackers(result as TrackerItemResult[]);
      })
      .catch(() => {
        if (!cancelled) setTrackers([]);
      });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open || !workspacePath || !window.electronAPI?.searchWorkspaceFileNames) {
      setFiles([]);
      return;
    }
    const needle = query.trim();
    if (!needle || looksLikeUrl(needle) || trackerReferenceFromLink(needle)) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const api = window.electronAPI;
      if (!api?.searchWorkspaceFileNames) return;
      ensureWorkspaceFileCache(api, workspacePath)
        .then(() => api.searchWorkspaceFileNames!(workspacePath, needle))
        .then((results) => {
          if (!cancelled) setFiles(Array.isArray(results) ? results.slice(0, 12) : []);
        })
        .catch(() => {
          if (!cancelled) setFiles([]);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, workspacePath]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !optionsRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const options = useMemo<LinkOption[]>(() => {
    const needle = query.trim().toLowerCase();
    const trackerOptions = trackers
      .filter((item) => !item.archived)
      .filter((item) => {
        if (!needle) return true;
        return [item.issueKey, item.id, item.title, item.type, item.status]
          .some((part) => part?.toLowerCase().includes(needle));
      })
      .slice(0, 12)
      .map((item): LinkOption => {
        const key = item.issueKey || item.id;
        return {
          id: `tracker:${item.id}`,
          kind: 'tracker',
          value: trackerLink(key),
          title: item.title || key,
          detail: [key, item.type, item.status].filter(Boolean).join(' · '),
        };
      });
    const documentOptions = files
      .filter((file) => file.type !== 'directory')
      .map((file): LinkOption => {
        const relative = workspaceRelativePath(file.path, workspacePath);
        return {
          id: `document:${file.path}`,
          kind: 'document',
          value: relative,
          title: basename(relative),
          detail: relative,
        };
      });
    const urlOption = looksLikeUrl(query)
      ? [{ id: `url:${query}`, kind: 'url' as const, value: query.trim(), title: query.trim(), detail: 'Open external URL' }]
      : [];
    return [...trackerOptions, ...documentOptions, ...urlOption];
  }, [files, query, trackers, workspacePath]);

  useEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const margin = 12;
      const width = Math.min(620, window.innerWidth - margin * 2);
      const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const maxHeight = Math.max(180, Math.min(440, spaceBelow));
      setMenuStyle({ left, top: rect.bottom + 5, width, maxHeight });
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open, options.length]);

  useEffect(() => setActiveIndex(0), [query, options.length]);

  const choose = (option: LinkOption) => {
    onChange(option.value);
    setQuery(option.value);
    setOpen(false);
  };

  return (
    <div className="link-picker" ref={rootRef}>
      <input
        ref={inputRef}
        className="inspector-input"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          onChange(next);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && options.length > 0) {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % options.length);
          } else if (event.key === 'ArrowUp' && options.length > 0) {
            event.preventDefault();
            setActiveIndex((index) => (index - 1 + options.length) % options.length);
          } else if (event.key === 'Enter' && open && options[activeIndex]) {
            event.preventDefault();
            choose(options[activeIndex]);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder="Search trackers or documents, or paste a URL"
        role="combobox"
        aria-expanded={open}
        aria-controls="mindmap-link-options"
        aria-autocomplete="list"
      />
      {value && (
        <button
          type="button"
          className="link-picker-clear"
          aria-label="Clear link"
          onClick={() => {
            onChange('');
            setQuery('');
          }}
        >
          ×
        </button>
      )}
      {open && options.length > 0 && createPortal(
        <div
          ref={optionsRef}
          className="link-picker-options"
          id="mindmap-link-options"
          role="listbox"
          style={menuStyle}
        >
          {options.map((option, index) => (
            <button
              type="button"
              key={option.id}
              className={`link-picker-option ${index === activeIndex ? 'active' : ''}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              <span className={`link-picker-kind ${option.kind}`}>
                {option.kind === 'document' ? 'File' : option.kind === 'tracker' ? 'Issue' : 'URL'}
              </span>
              <span className="link-picker-option-copy">
                <span className="link-picker-option-title">{option.title}</span>
                <span className="link-picker-option-detail">{option.detail}</span>
              </span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
