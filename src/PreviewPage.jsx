export default function PreviewPage({ previewUrl, downloadUrl, onBack }) {
  return (
    <div className="previewPage">
      <div className="previewFrameWrap">
        <div className="previewFrame">
          {previewUrl ? (
            <video className="previewVideo" src={previewUrl} controls autoPlay loop />
          ) : (
            <div className="previewEmpty">Preview belum tersedia.</div>
          )}
        </div>
      </div>

      <div className="previewActions">
        <button className="actionPill" type="button" onClick={onBack}>
          Kembali
        </button>
        <a className="btn primary" href={downloadUrl} target="_blank" rel="noreferrer">
          Download
        </a>
      </div>
    </div>
  );
}
