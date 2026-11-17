const capabilities = [
  {
    title: 'Read the saved diff',
    description: 'Switch files and inspect the old and new lines captured for this PR revision.',
  },
  {
    title: 'Follow the evidence',
    description: 'Filter findings and jump to a matching saved line to check the reasoning yourself.',
  },
  {
    title: 'Revisit the report',
    description: 'Reopen the revision, AI status and available context from your saved analyses.',
  },
];

export default function WorkspaceCapabilities() {
  return (
    <ul className="workspace-capabilities" aria-label="Inside your review workspace">
      {capabilities.map(({ title, description }) => (
        <li key={title}>
          <strong>{title}</strong>
          <p>{description}</p>
        </li>
      ))}
    </ul>
  );
}
