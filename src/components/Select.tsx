import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export default function Select({
  value,
  onValueChange,
  disabled = false,
  label,
  children,
}: {
  value: string | number;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}) {
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const props = child.props as {
        value: string | number;
        children: ReactNode;
        disabled?: boolean;
      };
      return {
        value: String(props.value),
        label: Children.toArray(props.children).join(""),
        disabled: props.disabled,
      };
    });
  const selected = options.findIndex(
    (option) => option.value === String(value),
  );
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 200,
    maxHeight: 300,
  });
  const button = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const id = useId();
  const show = () => {
    if (!disabled) {
      setActive(Math.max(0, selected));
      setOpen(true);
    }
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled || disabled) return;
    onValueChange(option.value);
    setOpen(false);
    button.current?.focus();
  };
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      if (!button.current) return;
      const rect = button.current.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 14,
        above = rect.top - 14;
      const height = Math.min(300, options.length * 44 + 12);
      const upwards = below < Math.min(height, 160) && above > below;
      const maxHeight = Math.max(44, Math.min(height, upwards ? above : below));
      const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 20);
      setPosition({
        top: upwards ? Math.max(10, rect.top - maxHeight - 6) : rect.bottom + 6,
        left: Math.max(10, Math.min(rect.left, window.innerWidth - width - 10)),
        width,
        maxHeight,
      });
    };
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !button.current?.contains(event.target) &&
        !menu.current?.contains(event.target)
      )
        setOpen(false);
    };
    const close = () => setOpen(false);
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("click", outside, true);
    document.addEventListener("focusin", outside, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("click", outside, true);
      document.removeEventListener("focusin", outside, true);
      window.removeEventListener("blur", close);
    };
  }, [open, options.length]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-${active}`)
        ?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [active, open, id]);
  return (
    <>
      <button
        ref={button}
        type="button"
        role="combobox"
        className="select-trigger"
        aria-label={label}
        aria-expanded={open && !disabled}
        aria-controls={open ? id : undefined}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled}
        title={disabled ? "Unavailable while an operation is running" : label}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "Escape" || event.key === "Tab") {
            setOpen(false);
            if (event.key === "Escape") event.preventDefault();
            return;
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            if (!open) {
              show();
              return;
            }
            let index =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        options.length - 1,
                        active + (event.key === "ArrowDown" ? 1 : -1),
                      ),
                    );
            while (
              options[index]?.disabled &&
              index >= 0 &&
              index < options.length
            )
              index += event.key === "ArrowUp" || event.key === "End" ? -1 : 1;
            if (options[index]) setActive(index);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open ? choose(active) : show();
          } else if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            event.preventDefault();
            const text =
              (Date.now() - search.current.time < 700
                ? search.current.text
                : "") + event.key.toLowerCase();
            search.current = { text, time: Date.now() };
            const index = options.findIndex(
              (option) =>
                !option.disabled && option.label.toLowerCase().startsWith(text),
            );
            if (index >= 0) {
              if (!open) setOpen(true);
              setActive(index);
            }
          }
        }}
      >
        <span>{options[selected]?.label ?? "Choose an option"}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="listbox"
            aria-label={label}
            className="select-menu"
            style={{ position: "fixed", ...position }}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={option.value === String(value)}
                aria-disabled={option.disabled || undefined}
                className={`select-option ${index === active ? "highlighted" : ""}`}
                onPointerDown={(event) => event.preventDefault()}
                onPointerMove={() => !option.disabled && setActive(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {option.value === String(value) && (
                  <Check size={15} aria-hidden="true" />
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
