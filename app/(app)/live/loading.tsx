// Matchday sections: keep the section tabs' place and show the page shape while it loads.
export default function Loading() {
  return (
    <div className="rh sk-page" aria-busy="true" aria-label="Loading">
      <div className="sk sk-tabs" />
      <div className="sk sk-title" />
      <div className="sk-grid"><div className="sk sk-block tall" /><div className="sk-col"><div className="sk sk-block" /><div className="sk sk-block" /></div></div>
    </div>
  );
}
