import TemplateGallery from "./TemplateGallery.jsx";

export default function TemplatesEditor() {
  return (
    <div className="tpl-editor">
      <div className="tpl-editor-header">
        <div className="tpl-editor-title">📚 Template Gallery</div>
        <div className="tpl-editor-subtitle">
          Click any card to open a pre-filled editor — circuits, chemistry, and workflows
        </div>
      </div>
      <div className="tpl-editor-body">
        <TemplateGallery />
      </div>
    </div>
  );
}
