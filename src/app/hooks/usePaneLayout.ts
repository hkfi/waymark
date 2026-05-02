import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  LEFT_WIDTH_DEFAULT,
  LEFT_WIDTH_KEY,
  LEFT_WIDTH_MAX,
  LEFT_WIDTH_MIN,
  RIGHT_WIDTH_DEFAULT,
  RIGHT_WIDTH_KEY,
  RIGHT_WIDTH_MAX,
  RIGHT_WIDTH_MIN,
  clamp,
  storedWidth,
} from "../model";

export function usePaneLayout() {
  const [leftWidth, setLeftWidth] = useState(() =>
    storedWidth(LEFT_WIDTH_KEY, LEFT_WIDTH_DEFAULT, LEFT_WIDTH_MIN, LEFT_WIDTH_MAX),
  );
  const [rightWidth, setRightWidth] = useState(() =>
    storedWidth(RIGHT_WIDTH_KEY, RIGHT_WIDTH_DEFAULT, RIGHT_WIDTH_MIN, RIGHT_WIDTH_MAX),
  );

  useEffect(() => {
    window.localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidth));
  }, [leftWidth]);

  useEffect(() => {
    window.localStorage.setItem(RIGHT_WIDTH_KEY, String(rightWidth));
  }, [rightWidth]);

  const beginResize = useCallback(
    (side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startLeft = leftWidth;
      const startRight = rightWidth;

      function handleMove(moveEvent: PointerEvent) {
        const delta = moveEvent.clientX - startX;
        if (side === "left") {
          setLeftWidth(clamp(startLeft + delta, LEFT_WIDTH_MIN, LEFT_WIDTH_MAX));
          return;
        }
        setRightWidth(clamp(startRight - delta, RIGHT_WIDTH_MIN, RIGHT_WIDTH_MAX));
      }

      function handleUp() {
        document.body.classList.remove("is-resizing-pane");
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      }

      document.body.classList.add("is-resizing-pane");
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp, { once: true });
    },
    [leftWidth, rightWidth],
  );

  const shellStyle = useMemo(
    () =>
      ({
        "--shell-left": `${leftWidth}px`,
        "--shell-right": `${rightWidth}px`,
      }) as CSSProperties,
    [leftWidth, rightWidth],
  );

  return useMemo(
    () => ({
      shellStyle,
      left: {
        value: leftWidth,
        min: LEFT_WIDTH_MIN,
        max: LEFT_WIDTH_MAX,
        reset: () => setLeftWidth(LEFT_WIDTH_DEFAULT),
        beginResize: (event: ReactPointerEvent<HTMLDivElement>) => beginResize("left", event),
      },
      right: {
        value: rightWidth,
        min: RIGHT_WIDTH_MIN,
        max: RIGHT_WIDTH_MAX,
        reset: () => setRightWidth(RIGHT_WIDTH_DEFAULT),
        beginResize: (event: ReactPointerEvent<HTMLDivElement>) => beginResize("right", event),
      },
    }),
    [beginResize, leftWidth, rightWidth, shellStyle],
  );
}
