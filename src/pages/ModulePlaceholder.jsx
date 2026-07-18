export default function ModulePlaceholder({ code, title, phase }) {
  return (
    <div className="module-placeholder">
      <span className="tag mono">{code}</span>
      <h2>{title}</h2>
      <p>Ce module fait partie de {phase} du BRS KASMOK Pharmacy. Il n'est pas encore construit.</p>
    </div>
  );
}