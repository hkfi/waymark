import { AppProvider } from "./app/AppProvider";
import { AppShell } from "./app/AppShell";

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
