// Direção visual: Saúde Pública Editorial — dois contextos claros: aplicativo da equipe e administrativo de dados.
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TermsGate } from "@/components/TermsModal";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Admin from "./pages/Admin";
import Home from "./pages/Home";

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><TermsGate /><Switch><Route path="/administrativo" component={Admin} /><Route component={Home} /></Switch></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
