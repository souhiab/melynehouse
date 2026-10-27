import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";

export function RichTextEditor({ initialHtml, onChange }) {
  const editor = useEditor({
    extensions: [StarterKit, TextAlign.configure({ types: ["heading", "paragraph"], defaultAlignment: "right" })],
    content: initialHtml || "<p></p>",
    editorProps: { attributes: { class: "owner-rich-content", dir: "rtl", "aria-label": "وصف المنتج بالتفصيل" } },
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
  });
  if (!editor) return <p>جارٍ تحميل محرر الوصف…</p>;
  const button = (label, command, active = false) => <button type="button" className={active ? "active" : ""} onClick={command} aria-label={label} title={label}>{label}</button>;
  const addLink = () => {
    const href = window.prompt("رابط HTTPS أو مسار داخل المتجر", editor.getAttributes("link").href || "https://");
    if (href === null) return;
    if (!href.trim()) { editor.chain().focus().unsetLink().run(); return; }
    if (!/^https:\/\//i.test(href) && !/^\/(?!\/)/.test(href)) { window.alert("استخدم رابط HTTPS أو مساراً داخل المتجر."); return; }
    editor.chain().focus().setLink({ href: href.trim() }).run();
  };
  return <div className="owner-rich-editor">
    <div className="owner-rich-toolbar" role="toolbar" aria-label="تنسيق وصف المنتج">
      {button("فقرة", () => editor.chain().focus().setParagraph().run(), editor.isActive("paragraph"))}
      {button("عنوان", () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
      {button("عريض", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {button("مائل", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {button("قائمة", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
      {button("مرقمة", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {button("يمين", () => editor.chain().focus().setTextAlign("right").run())}
      {button("وسط", () => editor.chain().focus().setTextAlign("center").run())}
      {button("رابط", addLink, editor.isActive("link"))}
      {button("تراجع", () => editor.chain().focus().undo().run())}
      {button("إعادة", () => editor.chain().focus().redo().run())}
    </div>
    <EditorContent editor={editor} />
  </div>;
}
