import { Children, memo, cloneElement, isValidElement, useState, ReactElement, PropsWithChildren } from 'react';
import { List, ListProps } from '@mui/material';
import styled from '@emotion/styled';
import { DndContext, DragEndEvent, useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor, DragOverlay } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export type DraggableListProps = PropsWithChildren<
  ListProps & {
    onDragEnd?: (event: DragEndEvent) => void;
    onItemsChanged?: (source: number, destination: number) => void;
  }
>;

const DraggableItem = styled('div')<{ $isDragging?: boolean }>`
  touch-action: none;
  transition:
    transform 150ms ease,
    box-shadow 150ms ease,
    opacity 150ms ease;
  ${(p) =>
    p.$isDragging
      ? `
		opacity: 0.85;
		box-shadow: 0 6px 18px rgba(0,0,0,0.25);
		transform: translateZ(0);
	`
      : ''}
`;

const OverlayWrapper = styled('div')`
  > * {
    opacity: 0.85;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
    transform: translateZ(0);
  }
`;

const SortableItem = ({ id, child }: { id: string; child: any }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
  };

  return (
    <DraggableItem
      ref={setNodeRef as any}
      {...attributes}
      {...listeners}
      style={style as any}
      $isDragging={isDragging}
      data-drag-handle
      tabIndex={0}
      role="button"
      aria-roledescription="draggable"
      aria-grabbed={isDragging}
    >
      {isValidElement(child) ? cloneElement(child as ReactElement<any>) : <div>{child}</div>}
    </DraggableItem>
  );
};

const DraggableList = memo((props: DraggableListProps) => {
  const { onDragEnd, onItemsChanged, children, ...listProps } = props;

  const childArray = Children.toArray(children);

  // Build stable ids from child.key if present; fallback to index
  const items = childArray.map((child, index) => {
    const el = child as ReactElement | null;
    return el && el.key != null ? String(el.key) : String(index);
  });

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeIndex = activeId ? items.indexOf(activeId) : -1;

  const activeChild = activeIndex >= 0 ? childArray[activeIndex] : null;

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={(event) => setActiveId(String(event.active.id))}
        onDragEnd={(event) => {
          setActiveId(null);
          onDragEnd?.(event);

          if (onItemsChanged && event.active && event.over) {
            const source = items.indexOf(String(event.active.id));
            const destination = items.indexOf(String(event.over.id));
            if (source !== -1 && destination !== -1 && source !== destination) {
              onItemsChanged(source, destination);
            }
          }
        }}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <List {...listProps}>
            {childArray.map((child, index) => (
              <SortableItem key={items[index]} id={items[index]} child={child} />
            ))}
          </List>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 150 }}>
          {activeChild && isValidElement(activeChild) ? (
            <OverlayWrapper>{cloneElement(activeChild as ReactElement<any>)}</OverlayWrapper>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
});

export default DraggableList;
