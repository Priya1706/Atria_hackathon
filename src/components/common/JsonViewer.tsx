import React, { useState } from 'react';
import { Copy, Check, Search, ChevronRight, ChevronDown } from 'lucide-react';

interface JsonViewerProps {
  data: Record<string, unknown> | unknown[];
  title?: string;
  initialExpanded?: boolean;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({
  data,
  title = 'PAYLOAD JSON',
  initialExpanded = true,
}) => {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Syntax highlighting renderer
  const renderHighlightedJson = (val: string, query: string) => {
    const lines = val.split('\n');

    return lines.map((line, idx) => {
      // Check query match
      const isMatch = query && line.toLowerCase().includes(query.toLowerCase());

      return (
        <div
          key={idx}
          className={`font-mono text-xs leading-relaxed hover:bg-gray-800/50 px-2 py-0.5 rounded transition-colors ${
            isMatch ? 'bg-amber-500/20 text-amber-200' : ''
          }`}
        >
          <span className="text-gray-600 select-none inline-block w-8 text-right mr-3 text-[10px]">
            {idx + 1}
          </span>
          {highlightLine(line)}
        </div>
      );
    });
  };

  const highlightLine = (line: string) => {
    // Regex for JSON tokens: key, string, number, boolean, null
    const parts: React.ReactNode[] = [];
    const keyMatch = line.match(/^(\s*)(".*?")(\s*:)/);

    if (keyMatch) {
      const indent = keyMatch[1];
      const key = keyMatch[2];
      const colon = keyMatch[3];
      const rest = line.substring(keyMatch[0].length);

      parts.push(<span key="indent">{indent}</span>);
      parts.push(<span key="key" className="text-emerald-400 font-medium">{key}</span>);
      parts.push(<span key="colon" className="text-gray-500">{colon}</span>);
      parts.push(<span key="rest">{highlightValue(rest)}</span>);
    } else {
      parts.push(<span key="val">{highlightValue(line)}</span>);
    }

    return parts;
  };

  const highlightValue = (val: string) => {
    // String value
    if (/"(?:[^"\\]|\\.)*"/.test(val)) {
      return <span className="text-amber-300">{val}</span>;
    }
    // Boolean
    if (/\b(true|false)\b/.test(val)) {
      return <span className="text-purple-400 font-semibold">{val}</span>;
    }
    // Number
    if (/\b\d+(\.\d+)?\b/.test(val)) {
      return <span className="text-cyan-400">{val}</span>;
    }
    // Null
    if (/\bnull\b/.test(val)) {
      return <span className="text-rose-400 italic">{val}</span>;
    }
    return <span className="text-gray-300">{val}</span>;
  };

  return (
    <div className="bg-[#0D1117] border border-gray-800 rounded-lg overflow-hidden font-mono">
      <div className="bg-[#161B22] px-4 py-2.5 border-b border-gray-800 flex items-center justify-between gap-3 text-xs">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 font-semibold text-gray-300 hover:text-white transition-colors"
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
          <span>{title}</span>
          <span className="text-[10px] text-gray-500 font-normal">
            ({(new TextEncoder().encode(jsonString).length)} bytes)
          </span>
        </button>

        <div className="flex items-center gap-2">
          {/* Quick Search */}
          <div className="relative flex items-center">
            <Search className="w-3 h-3 text-gray-500 absolute left-2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search JSON..."
              className="bg-[#0B0F19] text-gray-200 text-[11px] pl-6 pr-2 py-1 rounded border border-gray-700 focus:outline-none focus:border-emerald-500/60 w-32 focus:w-44 transition-all"
            />
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            title="Copy Raw JSON"
            className="flex items-center gap-1 text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-2.5 py-1 rounded border border-gray-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-gray-400" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 max-h-96 overflow-y-auto overflow-x-auto text-xs bg-[#090D14]">
          {renderHighlightedJson(jsonString, searchQuery)}
        </div>
      )}
    </div>
  );
};
