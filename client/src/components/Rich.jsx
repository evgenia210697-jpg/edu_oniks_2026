import { useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import { generateHTML, generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle, Color, FontSize } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Link2, Highlighter, AlignLeft, AlignCenter, AlignRight,
  Heading2, Heading3, Pilcrow, Quote, RemoveFormatting, Undo2, Redo2, Baseline, ALargeSmall, ChevronDown,
} from 'lucide-react';
import { Menu, usePrompt } from './ui';
import ColorPicker from './ColorPicker';

const baseExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: { openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' }, protocols: ['http', 'https', 'mailto', 'tel'] },
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight.configure({ multicolor: true }),
  TextStyle,
  Color,
  FontSize,
];

const FONT_SIZES = [
  { label: 'Мелкий', value: '13px' },
  { label: 'Обычный', value: null },
  { label: 'Крупный', value: '19px' },
  { label: 'Очень крупный', value: '24px' },
];
// Фирменные цвета компании — первыми в палитре (цвет платформы берётся из настроек)
const brandColors = () => {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2f5bea';
  return [accent, '#19212c', '#d63b3b', '#15935b', '#e0730b'];
};

/** Безопасный вывод HTML: разбирается по схеме редактора, всё лишнее отбрасывается */
export function RichText({ html, className = '' }) {
  const safe = useMemo(() => {
    if (!html) return '';
    try { return generateHTML(generateJSON(html, baseExtensions), baseExtensions); } catch { return ''; }
  }, [html]);
  return <div className={`rt ${className}`} dangerouslySetInnerHTML={{ __html: safe }} />;
}


function Toolbar({ editor, minimal }) {
  const prompt = usePrompt();
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }), bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'), link: e.isActive('link'), mark: e.isActive('highlight'), quote: e.isActive('blockquote'),
      left: e.isActive({ textAlign: 'left' }), center: e.isActive({ textAlign: 'center' }), right: e.isActive({ textAlign: 'right' }),
      color: e.getAttributes('textStyle').color || null, markColor: e.getAttributes('highlight').color || null,
      fontSize: e.getAttributes('textStyle').fontSize || null,
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
      <Menu align="left" className="cp-menu" trigger={({ toggle, open }) => (
        <button type="button" className={`tb-btn tb-color ${open ? 'on' : ''}`} title="Цвет текста" onMouseDown={(e) => e.preventDefault()} onClick={toggle}>
          <Baseline size={16} /><i style={{ background: s.color || 'var(--text)' }} />
        </button>
      )}>
        {({ close }) => (
          <ColorPicker value={s.color} extra={brandColors()} resetLabel="Цвет по умолчанию"
            onChange={(col) => { if (col) c().setColor(col).run(); else c().unsetColor().run(); close(); }} />
        )}
      </Menu>
      <Menu align="left" className="cp-menu" trigger={({ toggle, open }) => (
        <button type="button" className={`tb-btn tb-color ${s.mark || open ? 'on' : ''}`} title="Выделить маркером" onMouseDown={(e) => e.preventDefault()} onClick={toggle}>
          <Highlighter size={16} /><i style={{ background: s.markColor || '#fff1a8' }} />
        </button>
      )}>
        {({ close }) => (
          <ColorPicker value={s.markColor} recentKey="lms-recent-marks" resetLabel="Убрать выделение"
            extra={['#fff1a8', '#d9f5e3', '#dbe8ff', '#ffe0e0', '#f0e3ff']}
            onChange={(col) => { if (col) c().setHighlight({ color: col }).run(); else c().unsetHighlight().run(); close(); }} />
        )}
      </Menu>
      {!minimal && (
        <Menu align="left" trigger={({ toggle, open }) => (
          <button type="button" className={`tb-btn tb-wide ${s.fontSize || open ? 'on' : ''}`} title="Размер текста" onMouseDown={(e) => e.preventDefault()} onClick={toggle}>
            <ALargeSmall size={17} /><ChevronDown size={12} />
          </button>
        )}>
          {FONT_SIZES.map((f) => (
            <button key={f.label} type="button" className={`menu-item ${s.fontSize === f.value ? 'active' : ''}`} onMouseDown={(e) => e.preventDefault()}
              onClick={() => (f.value ? c().setFontSize(f.value).run() : c().unsetFontSize().run())}>
              <span style={{ fontSize: f.value || '15px' }}>{f.label}</span>
            </button>
          ))}
        </Menu>
      )}
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
