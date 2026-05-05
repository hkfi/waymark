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
  VIEW_ZOOM_DEFAULT,
  VIEW_ZOOM_KEY,
  VIEW_ZOOM_MAX,
  VIEW_ZOOM_MIN,
  VIEW_ZOOM_STEP,
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
  const [viewZoom, setViewZoom] = useState(() =>
    storedWidth(VIEW_ZOOM_KEY, VIEW_ZOOM_DEFAULT, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX),
  );

  useEffect(() => {
    window.localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidth));
  }, [leftWidth]);

  useEffect(() => {
    window.localStorage.setItem(RIGHT_WIDTH_KEY, String(rightWidth));
  }, [rightWidth]);

  useEffect(() => {
    window.localStorage.setItem(VIEW_ZOOM_KEY, String(viewZoom));
  }, [viewZoom]);

  const changeZoom = useCallback((delta: number) => {
    setViewZoom((value) => Number(clamp(value + delta, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX).toFixed(2)));
  }, []);

  const beginResize = useCallback(
    (side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startLeft = leftWidth;
      const startRight = rightWidth;

      function handleMove(moveEvent: PointerEvent) {
        const delta = (moveEvent.clientX - startX) / viewZoom;
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
    [leftWidth, rightWidth, viewZoom],
  );

  const shellStyle = useMemo(
    () =>
      ({
        "--shell-left": `${leftWidth}px`,
        "--shell-right": `${rightWidth}px`,
      }) as CSSProperties,
    [leftWidth, rightWidth],
  );

  const zoomStyle = useMemo(
    () =>
      ({
        "--app-zoom": String(viewZoom),
      }) as CSSProperties,
    [viewZoom],
  );

  return useMemo(
    () => ({
      shellStyle,
      zoom: {
        value: viewZoom,
        percent: Math.round(viewZoom * 100),
        style: zoomStyle,
        zoomIn: () => changeZoom(VIEW_ZOOM_STEP),
        zoomOut: () => changeZoom(-VIEW_ZOOM_STEP),
        reset: () => setViewZoom(VIEW_ZOOM_DEFAULT),
      },
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
    [beginResize, changeZoom, leftWidth, rightWidth, shellStyle, viewZoom, zoomStyle],
  );
}
