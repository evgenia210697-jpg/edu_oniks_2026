import { useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import { generateHTML, generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Link2, Highlighter, AlignLeft, AlignCenter, AlignRight,
  Heading2, Heading3, Pilcrow, Quote, RemoveFormatting, Undo2, Redo2, Palette,
} from 'lucide-react';
import { Menu, usePrompt } from './ui';

const baseExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: { openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' }, protocols: ['http', 'https', 'mailto', 'tel'] },
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight,
  TextStyle,
  Color,
];

/** Безопасный вывод HTML: разбирается по схеме редактора, всё лишнее отбрасывается */
export function RichText({ html, className = '' }) {
  const safe = useMemo(() => {
    if (!html) return '';
    try { return generateHTML(generateJSON(html, baseExtensions), baseExtensions); } catch { return ''; }
  }, [html]);
  return <div className={`rt ${className}`} dangerouslySetInnerHTML={{ __html: safe }} />;
}

const COLORS = ['#19212c', '#6b7686', '#d63b3b', '#e0730b', '#c89b00', '#15935b', '#0e9aa7', '#2878d6', '#2f5bea', '#7c4ddb', '#c2408f', '#8a5a2b'];

function Toolbar({ editor, minimal }) {
  const prompt = usePrompt();
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }), bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'), link: e.isActive('link'), mark: e.isActive('highlight'), quote: e.isActive('blockquote'),
      left: e.isActive({ textAlign: 'left' }), center: e.isActive({ textAlign: 'center' }), right: e.isActive({ textAlign: 'right' }),
    }),
  });
  const btn = (on, onClick, Icon, title) => (
    <button type="button" className={`tb-btn ${on ? 'on' : ''}`} title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}><Icon size={16} /></button>
  );
  const c = () => editor.chain().focus();
  const setLink = async () => {
    const prev = editor.getAttributes('link').href || '';
    const url = await prompt({ title: 'Ссылка', label: 'Адрес ссылки', hint: 'Оставьте поле пустым, чтобы убрать ссылку', value: prev || 'https://', placeholder: 'https://…' });
    if (url === null) return;
    if (!url || url === 'https://') c().extendMarkRange('link').unsetLink().run();
    else c().extendMarkRange('link').setLink({ href: /^(https?:|mailto:|tel:|\/)/.test(url) ? url : `https://${url}` }).run();
  };
  return (
    <div className="rich-toolbar">
      {!minimal && <>
        {btn(!s.h2 && !s.h3, () => c().setParagraph().run(), Pilcrow, 'Обычный текст')}
        {btn(s.h2, () => c().toggleHeading({ level: 2 }).run(), Heading2, 'Заголовок')}
        {btn(s.h3, () => c().toggleHeading({ level: 3 }).run(), Heading3, 'Подзаголовок')}
        <span className="tb-sep" />
      </>}
      {btn(s.bold, () => c().toggleBold().run(), Bold, 'Жирный (Ctrl+B)')}
      {btn(s.italic, () => c().toggleItalic().run(), Italic, 'Курсив (Ctrl+I)')}
      {btn(s.underline, () => c().toggleUnderline().run(), Underline, 'Подчёркнутый (Ctrl+U)')}
      {btn(s.strike, () => c().toggleStrike().run(), Strikethrough, 'Зачёркнутый')}
      {btn(s.mark, () => c().toggleHighlight().run(), Highlighter, 'Выделить маркером')}
      <Menu align="left" trigger={({ toggle }) => (
        <button type="button" className="tb-btn" title="Цвет текста" onMouseDown={(e) => e.preventDefault()} onClick={toggle}><Palette size={16} /></button>
      )}>
        <div className="color-pop">
          {COLORS.map((col) => (
            <button key={col} type="button" className="menu-item" style={{ background: col, padding: 0 }} onMouseDown={(e) => e.preventDefault()}
              onClick={() => (col === COLORS[0] ? c().unsetColor().run() : c().setColor(col).run())} title={col} />
          ))}
        </div>
      </Menu>
      <span className="tb-sep" />
      {btn(s.bullet, () => c().toggleBulletList().run(), List, 'Маркированный список')}
      {btn(s.ordered, () => c().toggleOrderedList().run(), ListOrdered, 'Нумерованный список')}
      {!minimal && btn(s.quote, () => c().toggleBlockquote().run(), Quote, 'Цитата')}
      {btn(s.link, setLink, Link2, 'Ссылка')}
      {!minimal && <>
        <span className="tb-sep" />
        {btn(s.left, () => c().setTextAlign('left').run(), AlignLeft, 'По левому краю')}
        {btn(s.center, () => c().setTextAlign('center').run(), AlignCenter, 'По центру')}
        {btn(s.right, () => c().setTextAlign('right').run(), AlignRight, 'По правому краю')}
      </>}
      <span className="tb-sep" />
      {btn(false, () => c().unsetAllMarks().clearNodes().run(), RemoveFormatting, 'Очистить форматирование')}
      {btn(false, () => c().undo().run(), Undo2, 'Отменить (Ctrl+Z)')}
      {btn(false, () => c().redo().run(), Redo2, 'Повторить')}
    </div>
  );
}

/** Редактор форматированного текста */
export function RichEditor({ value, onChange, placeholder = 'Начните писать…', bare, minimal, compact, autoFocus }) {
  const lastEmitted = useRef(value);
  const editor = useEditor({
    extensions: [...baseExtensions, Placeholder.configure({ placeholder })],
    content: value || '',
    autofocus: autoFocus ? 'end' : false,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor: e }) => {
      const html = e.isEmpty ? '' : e.getHTML();
      lastEmitted.current = html;
      onChange?.(html);
    },
  });
  useEffect(() => {
    if (!editor || !autoFocus) return;
    const t = setTimeout(() => { if (!editor.isDestroyed) editor.commands.focus('end'); }, 30);
    return () => clearTimeout(t);
  }, [editor, autoFocus]);
  // внешнее обновление значения (например, очистка после отправки)
  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [value, editor]);
  if (!editor) return null;
  return (
    <div className={`rich ${bare ? 'bare' : ''} ${compact ? 'compact' : ''}`}>
      <Toolbar editor={editor} minimal={minimal} />
      <EditorContent editor={editor} />
    </div>
  );
}
