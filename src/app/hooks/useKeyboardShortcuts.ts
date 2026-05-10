import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { isTauri } from "../../tauri";
import type { Ticket, TicketStatus, WaymarkProject } from "../../types";
import { LANES_IN_QUEUE, type InspectorMode, type NavId } from "../model";

type KeyboardShortcutDeps = {
  project: WaymarkProject | null;
  nav: NavId;
  setNav: (id: NavId) => void;
  selectedTicket: Ticket | null;
  selectTicket: (ticket: Ticket) => void;
  toggleMulti: (id: string) => void;
  editTicket: (ticket: Ticket) => void;
  clearEditingTicket: () => void;
  setInspectorMode: (mode: InspectorMode) => void;
  changeStatus: (ticket: Ticket, status: TicketStatus) => void;
  sendHandoff: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  refreshWorkspace: () => Promise<void>;
  chooseWorkspace: () => Promise<void>;
  search: string;
  setSearch: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  captureOpen: boolean;
  createWorkspaceOpen: boolean;
  createProjectOpen: boolean;
  fileModalOpen: boolean;
  repoOnboardingOpen: boolean;
  editingTicketOpen: boolean;
  openCapture: () => void;
  closeCapture: () => void;
  closeCreateWorkspace: () => void;
  closeCreateProject: () => void;
  closeFileModal: () => void;
  closeRepoOnboarding: () => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  setNotice: (value: string | null) => void;
};

export const NAV_SHORTCUTS: NavId[] = ["home", "tickets", "memory", "context"];
const TICKET_ORDER: TicketStatus[] = [...LANES_IN_QUEUE, "done"];

export function useKeyboardShortcuts({
  project,
  nav,
  setNav,
  selectedTicket,
  selectTicket,
  toggleMulti,
  editTicket,
  clearEditingTicket,
  setInspectorMode,
  changeStatus,
  sendHandoff,
  zoomIn,
  zoomOut,
  resetZoom,
  refreshWorkspace,
  chooseWorkspace,
  search,
  setSearch,
  searchInputRef,
  captureOpen,
  createWorkspaceOpen,
  createProjectOpen,
  fileModalOpen,
  repoOnboardingOpen,
  editingTicketOpen,
  openCapture,
  closeCapture,
  closeCreateWorkspace,
  closeCreateProject,
  closeFileModal,
  closeRepoOnboarding,
  undo,
  redo,
  setNotice,
}: KeyboardShortcutDeps) {
  const latest = useRef<KeyboardShortcutDeps | null>(null);

  useLayoutEffect(() => {
    latest.current = {
      project,
      nav,
      setNav,
      selectedTicket,
      selectTicket,
      toggleMulti,
      editTicket,
      clearEditingTicket,
      setInspectorMode,
      changeStatus,
      sendHandoff,
      zoomIn,
      zoomOut,
      resetZoom,
      refreshWorkspace,
      chooseWorkspace,
      search,
      setSearch,
      searchInputRef,
      captureOpen,
      createWorkspaceOpen,
      createProjectOpen,
      fileModalOpen,
      repoOnboardingOpen,
      editingTicketOpen,
      openCapture,
      closeCapture,
      closeCreateWorkspace,
      closeCreateProject,
      closeFileModal,
      closeRepoOnboarding,
      undo,
      redo,
      setNotice,
    };
  });

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const current = latest.current;
      if (!current || event.defaultPrevented) return;

      const {
        project,
        nav,
        setNav,
        selectedTicket,
        selectTicket,
        toggleMulti,
        editTicket,
        clearEditingTicket,
        setInspectorMode,
        changeStatus,
        sendHandoff,
        zoomIn,
        zoomOut,
        resetZoom,
        refreshWorkspace,
        chooseWorkspace,
        search,
        setSearch,
        searchInputRef,
        captureOpen,
        createWorkspaceOpen,
        createProjectOpen,
        fileModalOpen,
        repoOnboardingOpen,
        editingTicketOpen,
        openCapture,
        closeCapture,
        closeCreateWorkspace,
        closeCreateProject,
        closeFileModal,
        closeRepoOnboarding,
        undo,
        redo,
        setNotice,
      } = current;
      const modalOpen = captureOpen || createWorkspaceOpen || createProjectOpen || fileModalOpen || repoOnboardingOpen || editingTicketOpen;

      function closeTopModal() {
        if (editingTicketOpen) {
          clearEditingTicket();
          return true;
        }
        if (repoOnboardingOpen) {
          closeRepoOnboarding();
          return true;
        }
        if (fileModalOpen) {
          closeFileModal();
          return true;
        }
        if (captureOpen) {
          closeCapture();
          return true;
        }
        if (createProjectOpen) {
          closeCreateProject();
          return true;
        }
        if (createWorkspaceOpen) {
          closeCreateWorkspace();
          return true;
        }
        return false;
      }

      function visibleTickets() {
        if (!project) return [];
        return TICKET_ORDER.flatMap((status) => project.tickets.filter((ticket) => ticket.status === status));
      }

      function selectRelativeTicket(delta: number) {
        const tickets = visibleTickets();
        if (tickets.length === 0) return;
        const currentTicket = selectedTicket ? tickets.findIndex((ticket) => ticket.id === selectedTicket.id) : -1;
        const next = currentTicket < 0 ? (delta > 0 ? 0 : tickets.length - 1) : (currentTicket + delta + tickets.length) % tickets.length;
        selectTicket(tickets[next]);
      }

      const key = event.key.toLowerCase();
      const command = event.metaKey || event.ctrlKey;
      const typing = isTypingTarget(event.target);
      const ticketScopedView = nav === "home" || nav === "tickets";

      if (key === "escape") {
        if (closeTopModal()) {
          event.preventDefault();
          return;
        }
        if (document.activeElement === searchInputRef.current && search) {
          event.preventDefault();
          setSearch("");
          return;
        }
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return;
      }

      if (command && key === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (command && !event.altKey && (key === "=" || key === "+" || key === "-" || key === "_" || key === "0")) {
        event.preventDefault();
        if (key === "0") {
          resetZoom();
          return;
        }
        if (key === "-" || key === "_") {
          zoomOut();
          return;
        }
        zoomIn();
        return;
      }

      if (typing || modalOpen || event.altKey) return;

      if (command && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          void redo();
        } else {
          void undo();
        }
        return;
      }

      if (command && key === "y") {
        event.preventDefault();
        void redo();
        return;
      }

      if (command && /^[1-4]$/.test(key)) {
        event.preventDefault();
        setNav(NAV_SHORTCUTS[Number(key) - 1]);
        return;
      }

      if (command && event.shiftKey && key === "a") {
        event.preventDefault();
        setInspectorMode("assistant");
        return;
      }

      if (command && (key === "[" || key === "]")) {
        event.preventDefault();
        const currentNav = NAV_SHORTCUTS.indexOf(nav);
        const delta = key === "]" ? 1 : -1;
        setNav(NAV_SHORTCUTS[(currentNav + delta + NAV_SHORTCUTS.length) % NAV_SHORTCUTS.length]);
        return;
      }

      if (command && key === "o") {
        event.preventDefault();
        void chooseWorkspace();
        return;
      }

      if (command && key === "r") {
        event.preventDefault();
        void refreshWorkspace();
        return;
      }

      if (command && key === "n" && !event.shiftKey) {
        event.preventDefault();
        if (!project) {
          setNotice("Open or create a project before capturing project memory.");
          return;
        }
        if (!isTauri()) {
          setNotice("Run Waymark through Tauri to capture tickets into YAML.");
          return;
        }
        openCapture();
        return;
      }

      if (command && key === "enter") {
        event.preventDefault();
        if (!ticketScopedView) {
          setNotice("Open Overview or Tickets to generate a ticket handoff.");
          return;
        }
        void sendHandoff();
        return;
      }

      if (!selectedTicket || !ticketScopedView) return;

      if (command && key === "e") {
        event.preventDefault();
        editTicket(selectedTicket);
        return;
      }

      if (command && event.shiftKey && key === "n") {
        event.preventDefault();
        void changeStatus(selectedTicket, "next");
        return;
      }

      if (command && key === "b") {
        event.preventDefault();
        void changeStatus(selectedTicket, "blocked");
        return;
      }

      if (command && key === "d") {
        event.preventDefault();
        void changeStatus(selectedTicket, "done");
        return;
      }

      const queueVisible = nav === "tickets" || nav === "home";
      if (!queueVisible) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectRelativeTicket(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        selectRelativeTicket(-1);
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        toggleMulti(selectedTicket.id);
        setInspectorMode("prompt");
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
}
