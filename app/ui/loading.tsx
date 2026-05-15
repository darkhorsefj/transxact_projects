import { ClipLoader } from "react-spinners";

export function Spinner() {
  return <ClipLoader color="var(--brand)" size={24} />;
}

export function Loading({ label }: { label: string }) {
  return (
    <section className="workflow-stack">
      <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
        <div style={{ marginBottom: "0.75rem" }}>
          <ClipLoader color="var(--brand)" size={28} />
        </div>
        <p className="empty-row">{label}</p>
      </div>
    </section>
  );
}
