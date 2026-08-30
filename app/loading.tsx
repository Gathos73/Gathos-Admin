export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading administration" className="loading-page">
      <div className="skeleton skeleton--eyebrow" />
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--copy" />
      <div className="loading-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="skeleton skeleton--card" key={index} />
        ))}
      </div>
    </div>
  );
}
