export function Loading({ label }: { label: string }) {
  return (
    <section className="workflow-stack">
      <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
        <div className="loading-spinner" />
        <p className="empty-row">{label}</p>
      </div>
    </section>
  );
}
