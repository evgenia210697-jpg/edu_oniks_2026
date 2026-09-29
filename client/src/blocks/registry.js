import {
  Type, Image, PlayCircle, AudioLines, Paperclip, Presentation, Table, Info, Quote, ChevronRightSquare, ListTodo, MousePointerClick, Globe, Code2, Minus,
} from 'lucide-react';
import { uid } from '../utils';

export const BLOCKS = [
  { type: 'text', label: 'Текст', icon: Type, data: () => ({ html: '' }) },
  { type: 'image', label: 'Картинка', icon: Image, data: () => ({ fileId: null, url: '', caption: '', size: 'full' }) },
  { type: 'video', label: 'Видео', icon: PlayCircle, data: () => ({ fileId: null, url: '', name: '', caption: '' }) },
  { type: 'audio', label: 'Аудио', icon: AudioLines, data: () => ({ fileId: null, name: '', caption: '' }) },
  { type: 'pdf', label: 'Презентация PDF', icon: Presentation, data: () => ({ fileId: null, name: '', size: 0, download: true }) },
  { type: 'file', label: 'Файлы', icon: Paperclip, data: () => ({ files: [] }) },
  { type: 'table', label: 'Таблица', icon: Table, data: () => ({ header: true, rows: [['', '', ''], ['', '', ''], ['', '', '']] }) },
  { type: 'callout', label: 'Выделенный блок', icon: Info, data: () => ({ variant: 'goal', title: 'Цель урока', html: '' }) },
  { type: 'quote', label: 'Цитата', icon: Quote, data: () => ({ html: '', author: '' }) },
  { type: 'spoiler', label: 'Спойлер', icon: ChevronRightSquare, data: () => ({ title: 'Подробнее', html: '' }) },
  { type: 'checklist', label: 'Чек-лист', icon: ListTodo, data: () => ({ items: [{ id: uid(), text: '' }] }) },
  { type: 'button', label: 'Кнопка', icon: MousePointerClick, data: () => ({ text: 'Перейти', url: '', align: 'left' }) },
  { type: 'embed', label: 'YouTube, Rutube, сайт', icon: Globe, data: () => ({ url: '' }) },
  { type: 'code', label: 'Код', icon: Code2, data: () => ({ code: '', lang: '' }) },
  { type: 'divider', label: 'Разделитель', icon: Minus, data: () => ({ style: 'solid' }) },
];

export const BLOCK_BY_TYPE = Object.fromEntries(BLOCKS.map((b) => [b.type, b]));

export const newBlock = (type) => ({ id: uid(), type, data: BLOCK_BY_TYPE[type].data() });

export const CALLOUT_VARIANTS = [
  { value: 'goal', label: 'Цель (фирменный цвет)' },
  { value: 'info', label: 'Информация (голубой)' },
  { value: 'success', label: 'Успех / важно (зелёный)' },
  { value: 'warning', label: 'Внимание (жёлтый)' },
  { value: 'danger', label: 'Запрещено / ошибка (красный)' },
];
