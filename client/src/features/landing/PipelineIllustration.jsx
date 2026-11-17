import { FileCode2, Braces, Filter, Workflow, Database } from 'lucide-react';

const stations = [
  { icon: FileCode2, color: 'coral', label: 'Pinned diff', caption: 'base + head' },
  { icon: Braces, color: 'green', label: 'Source context', caption: 'paths + lines' },
  { icon: Filter, color: 'yellow', label: 'Input budget', caption: 'omit + disclose' },
  { icon: Workflow, color: 'blue', label: 'Model + checks', caption: 'schema + evidence' },
  { icon: Database, color: 'orange', label: 'Saved report', caption: 'revision + verdict' },
];

export default function PipelineIllustration({ selected, onSelect }) {
  return (
    <div className="context-illustration" aria-label="Explore the context pipeline">
      <div className="context-rail" aria-hidden="true">
        <span style={{ width: `${selected * 25}%` }} />
      </div>
      {stations.map(({ icon: Icon, color, label, caption }, index) => (
        <button
          type="button"
          className="context-station"
          key={label}
          data-color={color}
          data-reached={index <= selected}
          aria-pressed={index === selected}
          aria-controls="context-stage-detail"
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') onSelect(index);
          }}
          onFocus={() => onSelect(index)}
          onClick={() => onSelect(index)}
        >
          <span className="context-station-icon">
            <Icon size={24} strokeWidth={1.5} />
          </span>
          <strong>{label}</strong>
          <small>{caption}</small>
        </button>
      ))}
      <span className="context-packet" style={{ left: `calc(10% + ${selected * 20}%)` }} aria-hidden="true" />
    </div>
  );
}
