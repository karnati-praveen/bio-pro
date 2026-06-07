import { QueryClient } from "@tanstack/react-query";

// Shared React Query client. Server data (parts, citations, CrossRef, PubChem)
// is cached here; long staleness suits a local-first, mostly-static catalogue.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
