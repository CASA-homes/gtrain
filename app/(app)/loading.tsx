// Shown the moment you tap a link, while the next page is put together on the server.
export default function Loading() {
  return (
    <div className="wrap sk-page" aria-busy="true" aria-label="Loading">
      <div className="sk sk-title" />
      <div className="sk-row"><div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" /></div>
      <div className="sk sk-block" />
      <div className="sk sk-block short" />
    </div>
  );
}
