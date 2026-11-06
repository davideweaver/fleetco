import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical } from "lucide-react";
import { labelFor, type NavItem } from "@/nav/routes";
import {
  arrangeNav,
  DEFAULT_PREFS,
  PHONE_SLOTS,
  useNavPrefs,
  writeNavPrefs,
} from "@/nav/preferences";
import { useShell } from "@/shell/shell-context";
import { Btn } from "@/shell/ListDetailLayout";
import { cn } from "@/lib/utils";

/**
 * Settings · Navigation. The first settings screen that does something, and the only one
 * whose subject is the person rather than the shop — ordering is a preference, not
 * configuration, so nothing here is shared and nothing here is a permission.
 *
 * There is no Save. Every change writes through and the rail beside you moves on the
 * click, which is the only way to judge "is this menu less cluttered" — a Save button
 * would make you commit to an arrangement you have not seen yet.
 *
 * The copy says MENU, never "rail". The rail is one of two ways this list is drawn — the
 * other is the phone's bottom bar, and this screen orders both.
 *
 * Reordering is a DRAG where there is a pointer and two ARROWS where there is a thumb.
 * Dragging a 48px row to a precise slot is a fiddly gesture on a phone and an obvious one
 * with a mouse, so the two inputs get the control that suits them rather than one control
 * that is a compromise on both. The handle is keyboard-operable too — focus it and press
 * the arrow keys — so "desktop" never means "mouse only".
 *
 * Built on `@dnd-kit/core`, the package the job board already uses. @dnd-kit/sortable is a
 * second package for what is, in a single vertical list, one splice.
 */
/** The width at which this screen has room for two columns and a drag is comfortable. */
const WIDE = 768;

/**
 * Measures the screen's own box rather than the window. This pane is the right half of a
 * list-detail layout, so the viewport is some 500px wider than the space being laid out —
 * and in the device lab it is the frame that matters, not the Mac the frame is drawn on.
 *
 * It returns a boolean rather than leaving this to a `@container` query because three
 * things hang off it — the two columns, the drag, the arrows — and one of them is a
 * `disabled` prop on a hook. CSS cannot set that, and a CSS answer that disagreed with the
 * JS one would mean visible arrows that no longer move anything.
 */
function useWide(): [(node: HTMLElement | null) => void, boolean] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= WIDE));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, wide];
}

export function NavSettings() {
  const { role } = useShell();
  const prefs = useNavPrefs(role);
  const nav = arrangeNav(role, prefs);

  // Shown first, hidden after, always. Normalising on every write is what makes "move up"
  // mean one row: leave a hidden section sitting between two visible ones and the arrow
  // swaps with something that is not on screen, so the click looks like it did nothing.
  const commit = (shown: NavItem[], hidden: NavItem[]) =>
    writeNavPrefs(role, {
      order: [...shown, ...hidden].map((i) => i.key),
      hidden: hidden.map((i) => i.key),
    });

  const move = (key: string, delta: number) => {
    const shown = [...nav.shown];
    const from = shown.findIndex((i) => i.key === key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= shown.length) return;
    [shown[from], shown[to]] = [shown[to], shown[from]];
    commit(shown, nav.hidden);
  };

  /** Lift `key` out and drop it where `onto` is standing. */
  const moveTo = (key: string, onto: string) => {
    const shown = [...nav.shown];
    const from = shown.findIndex((i) => i.key === key);
    const to = shown.findIndex((i) => i.key === onto);
    if (from < 0 || to < 0 || from === to) return;
    const [picked] = shown.splice(from, 1);
    shown.splice(to, 0, picked);
    commit(shown, nav.hidden);
  };

  const [measure, wide] = useWide();
  const [dragging, setDragging] = useState<NavItem | null>(null);
  // The same 6px threshold the job board uses: a click on the handle should still be a
  // click, and only a deliberate pull should start a move.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragStart = (e: DragStartEvent) =>
    setDragging(nav.shown.find((i) => i.key === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (e.over) moveTo(String(e.active.id), String(e.over.id));
  };

  const hide = (key: string) => {
    const item = nav.shown.find((i) => i.key === key);
    if (!item) return;
    commit(
      nav.shown.filter((i) => i.key !== key),
      [...nav.hidden, item]
    );
  };

  const show = (key: string) => {
    const item = nav.hidden.find((i) => i.key === key);
    if (!item) return;
    commit(
      [...nav.shown, item],
      nav.hidden.filter((i) => i.key !== key)
    );
  };

  const customised = prefs.order.length > 0 || prefs.hidden.length > 0;

  return (
    /* Left-aligned, not centred — see "Content starts at the left edge" in UI Vocabulary.
       The horizontal padding is `DetailHeader`'s, so the body lines up with the title
       above it.

       Two columns once the pane has the width for them, which is a CONTAINER query, not a
       viewport one: this pane is the right half of a list-detail screen, so the viewport
       is 400px wider than the space actually being laid out. */
    <div
      ref={measure}
      className={cn("flex flex-col gap-6 px-4 py-5 lg:px-5", wide && "flex-row gap-8")}
    >
      {/* First in the DOM so a narrow pane reads instructions-then-lists, and so a screen
          reader hears what this screen is for before it starts naming rows. `order-last`
          only moves it once there is a second column to move it into. */}
      <aside className={cn("shrink-0", wide && "order-last w-64")}>
        <p className="text-sm text-muted-foreground">
          This is the order of your menu, and the first {PHONE_SLOTS} are the buttons
          along the bottom of a phone. Hiding a section only moves it behind More — it
          stays searchable, and it stays yours.
        </p>
        {customised && (
          <span
            onClick={() => writeNavPrefs(role, DEFAULT_PREFS)}
            className="mt-3 inline-block"
          >
            <Btn>Reset</Btn>
          </span>
        )}
      </aside>

      <div className="min-w-0 flex-1">
      <Label>In the menu</Label>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="overflow-hidden rounded-xl border bg-card">
          {/* No rule across the list at slot four. The "Phone button 1…4" notes already
              say which rows reach the bottom bar, said once per row and in the place the
              fact belongs — a second mark for the same boundary is one too many. */}
          {nav.shown.map((item, i) => (
            <DragRow
              key={item.key}
              item={item}
              label={labelFor(item, role)}
              note={i < PHONE_SLOTS ? `Phone button ${i + 1}` : undefined}
              draggable={wide}
              onKeyMove={(delta) => move(item.key, delta)}
              actions={
                <>
                  {/* Arrows where a drag is not on offer. Exactly where, is the one
                      `wide` that also turns the drag on — so there is never a row with
                      neither way to move it, nor one with both. */}
                  {!wide && (
                    <>
                      <IconBtn
                        label={`Move ${labelFor(item, role)} up`}
                        disabled={i === 0}
                        onClick={() => move(item.key, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </IconBtn>
                      <IconBtn
                        label={`Move ${labelFor(item, role)} down`}
                        disabled={i === nav.shown.length - 1}
                        onClick={() => move(item.key, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </IconBtn>
                    </>
                  )}
                  <IconBtn
                    label={`Hide ${labelFor(item, role)}`}
                    /* The last one cannot go. A menu that is only a More button is not
                       a menu, and this screen would be behind that button. */
                    disabled={nav.shown.length === 1}
                    onClick={() => hide(item.key)}
                  >
                    <EyeOff className="size-4" />
                  </IconBtn>
                </>
              }
            />
          ))}
        </div>

        {/* The row follows the cursor rather than a ghost of it being left behind — the
            thing you are moving should be the thing under your hand. */}
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="rounded-xl border bg-card shadow-lg">
              <RowBody item={dragging} label={labelFor(dragging, role)} handle />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <Label>Behind More</Label>
      {nav.hidden.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
          Nothing is hidden, so the menu has no More button.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {/* Not draggable. These have no order to speak of — they are what is left
              after the menu, and More lists them as they fall. */}
          {nav.hidden.map((item) => (
            <div key={item.key} className="border-b last:border-b-0">
              <RowBody
                item={item}
                label={labelFor(item, role)}
                muted
                actions={
                  <IconBtn
                    label={`Show ${labelFor(item, role)} in the menu`}
                    onClick={() => show(item.key)}
                  >
                    <Eye className="size-4" />
                  </IconBtn>
                }
              />
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-2 mt-6 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground first:mt-0">
    {children}
  </div>
);

/**
 * A row you can pick up. Draggable and droppable under one id: in a single column, "what
 * am I holding" and "where would it land" are the same list of rows, so a separate set of
 * drop zones between them would be inventing targets the user cannot see.
 *
 * The WHOLE ROW is the grab area, not the handle. The handle is still drawn, because a
 * row that happens to be draggable and never says so is a thing people do not find — but
 * it advertises the gesture rather than rationing it. The 6px threshold is what keeps the
 * buttons on the right usable: a press that does not travel is still a click.
 */
function DragRow({
  item,
  label,
  note,
  draggable,
  onKeyMove,
  actions,
}: {
  item: NavItem;
  label: string;
  note?: string;
  /** Off where a drag would be fighting the scroll — see `useWide`. */
  draggable: boolean;
  /** Keyboard reordering, so the handle is not a mouse-only control. */
  onKeyMove: (delta: number) => void;
  actions: React.ReactNode;
}) {
  const drag = useDraggable({ id: item.key, disabled: !draggable });
  const drop = useDroppable({ id: item.key, disabled: !draggable });

  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...(draggable ? drag.listeners : {})}
      {...drag.attributes}
      className={cn(
        "border-b last:border-b-0",
        // `select-none` or the first drag paints the whole list blue; `touch-none` only
        // where dragging is on, or a thumb could no longer scroll the page.
        draggable && "cursor-grab select-none touch-none active:cursor-grabbing",
        drag.isDragging && "opacity-30",
        drop.isOver && !drag.isDragging && "bg-accent"
      )}
    >
      <RowBody
        item={item}
        label={label}
        note={note}
        actions={actions}
        handle={draggable}
        handleProps={{
          tabIndex: 0,
          role: "button",
          "aria-label": `Reorder ${label}`,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            // Beats dnd-kit's keyboard sensor here, which moves by a pixel step and has
            // to be told how tall a row is. One row per press needs no measuring.
            e.preventDefault();
            onKeyMove(e.key === "ArrowUp" ? -1 : 1);
          },
        }}
      />
    </div>
  );
}

/** The look of a row, with no opinion about dragging. Shared with the drag overlay. */
function RowBody({
  item,
  label,
  note,
  muted,
  handle,
  handleProps,
  actions,
}: {
  item: NavItem;
  label: string;
  note?: string;
  muted?: boolean;
  handle?: boolean;
  handleProps?: Record<string, unknown>;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {handle && (
        /* A sign, and the keyboard's way in — the pointer grabs the row, this takes focus
           and answers the arrow keys. */
        <span
          {...handleProps}
          className="shrink-0 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GripVertical className="size-4" />
        </span>
      )}
      <item.icon
        className={cn("size-5 shrink-0", muted ? "text-muted-foreground" : "")}
        strokeWidth={1.75}
      />
      <span className={cn("min-w-0 flex-1 truncate text-sm", muted && "text-muted-foreground")}>
        {label}
      </span>
      {note && (
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{note}</span>
      )}
      {actions && <span className="flex shrink-0 items-center gap-1">{actions}</span>}
    </div>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30",
        className
      )}
    >
      {children}
    </button>
  );
}
