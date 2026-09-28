// Render the initial reviewer dashboard shell for the beta.
function DashboardPage() {
  return (
    <main className="dashboard-shell">
      <p className="eyebrow">PRism AI</p>
      <h1>Pull Request risk, made clearer.</h1>
      <p className="intro">
        Submit a Pull Request to see the evidence and review areas that deserve attention first.
      </p>
      <section className="empty-state" aria-labelledby="empty-state-title">
        <p className="section-label">Beta foundation</p>
        <h2 id="empty-state-title">Your next analysis will appear here.</h2>
        <p>The Pull Request submission flow is the next feature task.</p>
      </section>
    </main>
  );
}

export default DashboardPage;