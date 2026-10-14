import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { DependenciesProvider } from '../core/di/dependencies'
import { AuthProvider } from '../features/auth/application/auth-context'
import { ToastProvider } from '../shared/ui/toast'
import { dependencies } from './composition-root'
import { router } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } }).response?.status
        return status !== undefined && status < 500 ? false : failureCount < 2
      },
      refetchOnWindowFocus: true,
      staleTime: 15_000,
      // Lo que hacen otros usuarios (marcas, cambios de clases, justificaciones…) aparece solo,
      // sin recargar: se vuelve a consultar cada 30 s mientras la pestaña está visible.
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  },
})

export function App() {
  return (
    <DependenciesProvider value={dependencies}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </DependenciesProvider>
  )
}
