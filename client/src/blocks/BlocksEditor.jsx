import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal, ArrowUp, ArrowDown, Copy, Trash2, Plus, X } from 'lucide-react';
import { Menu, MenuItem } from '../components/ui';
import { BLOCKS, BLOCK_BY_TYPE, newBlock } from './registry';
import { BlockEdit } from './BlockEdit';
import { BlockBoundary } from './BlockView';
import { uid } from '../utils';

export function Palette({ onPick }) {
  return (
    <div className="palette">
      {BLOCKS.map((b) => (
        <button type="button" key={b.type} className="palette-item" onClick={() => onPick(b.type)}>
          <b.icon size={22} />{b.label}
        </button>
      ))}
    </div>
  );
}

function SortableBlock({ block, index, total, onChange, onMove, onDuplicate, onRemove, onInsert, autoFocus }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const def = BLOCK_BY_TYPE[block.type];
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'dragging' : ''}>
      <div className="block-wrap">
        <div className="block-side">
          <button type="button" className="drag-handle" {...attributes} {...listeners} aria-label="Перетащить блок" title="Перетащите, чтобы поменять порядок"><GripVertical size={16} /></button>
          <Menu align="left" trigger={({ toggle }) => (
            <button type="button" className="drag-handle" onClick={toggle} aria-label="Действия с блоком"><MoreHorizontal size={16} /></button>
          )}>
            <MenuItem icon={ArrowUp} disabled={index === 0} onClick={() => onMove(-1)}>Переместить выше</MenuItem>
            <MenuItem icon={ArrowDown} disabled={index === total - 1} onClick={() => onMove(1)}>Переместить ниже</MenuItem>
            <MenuItem icon={Copy} onClick={onDuplicate}>Дублировать</MenuItem>
            <MenuItem icon={Plus} onClick={onInsert}>Добавить блок ниже</MenuItem>
            <div className="menu-sep" />
            <MenuItem icon={Trash2} danger onClick={onRemove}>Удалить блок</MenuItem>
          </Menu>
        </div>
        <div className="block-body">
          <div className="block-type-tag">{def && <def.icon size={12} />}{def?.label || block.type}</div>
          <BlockBoundary><BlockEdit block={block} onChange={onChange} autoFocus={autoFocus} /></BlockBoundary>
        </div>
      </div>
    </div>
  );
}

/** Редактор списка блоков одной страницы */
export default function BlocksEditor({ blocks, onChange, emptyHint = 'Страница пустая. Добавьте первый блок — текст, видео, презентацию или файл.' }) {
  const [pickerAt, setPickerAt] = useState(blocks.length ? null : 0);
  const [focusId, setFocusId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const update = (fn) => onChange(fn);
  const insert = (type, at) => {
    const b = newBlock(type);
    update((bs) => [...bs.slice(0, at), b, ...bs.slice(at)]);
    setFocusId(b.id);
    setPickerAt(null);
  };

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    update((bs) => arrayMove(bs, bs.findIndex((b) => b.id === active.id), bs.findIndex((b) => b.id === over.id)));
  };

  const picker = (at) => (
    <div className="card card-pad" style={{ padding: 14, margin: '10px 0', boxShadow: 'var(--shadow)' }}>
      <div className="row mb-8"><span className="label flex-1">Выберите тип блока</span>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setPickerAt(null)} aria-label="Закрыть"><X size={16} /></button>
      </div>
      <Palette onPick={(t) => insert(t, at)} />
    </div>
  );

  return (
    <div>
      {!blocks.length && pickerAt === null && <div className="muted small mb-8">{emptyHint}</div>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((b, i) => (
            <div key={b.id}>
              {pickerAt === i ? picker(i) : (
                <div className="insert-line"><button type="button" onClick={() => setPickerAt(i)} title="Вставить блок сюда"><Plus size={14} /></button></div>
              )}
              <SortableBlock
                block={b} index={i} total={blocks.length} autoFocus={focusId === b.id}
                onChange={(nb) => update((bs) => bs.map((x) => (x.id === nb.id ? nb : x)))}
                onMove={(dir) => update((bs) => arrayMove(bs, i, i + dir))}
                onDuplicate={() => update((bs) => [...bs.slice(0, i + 1), { ...structuredClone(b), id: uid() }, ...bs.slice(i + 1)])}
                onRemove={() => update((bs) => bs.filter((x) => x.id !== b.id))}
                onInsert={() => setPickerAt(i + 1)}
              />
            </div>
          ))}
        </SortableContext>
      </DndContext>
      <div className="add-block-area">
        {pickerAt === blocks.length ? picker(blocks.length) : (
          <button type="button" className="btn btn-soft" onClick={() => setPickerAt(blocks.length)}><Plus size={16} />Добавить блок</button>
        )}
      </div>
    </div>
  );
}
