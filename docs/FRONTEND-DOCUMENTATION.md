# Documentação Técnica do Frontend - SimpleXR DAM 3D

## Visão Geral

Este documento descreve a arquitetura, padrões e práticas adotadas no desenvolvimento do frontend do SimpleXR Headless CMS 3D.

## Estrutura de Pastas

```
admin/src/
├── components/
│   ├── common/           # Componentes reutilizáveis (FilterBar, PageHeader)
│   ├── feedback/         # Componentes de feedback (ErrorBoundary, Spinner, Skeleton)
│   ├── Layout/           # Componentes de layout (Sidebar, Header, MainLayout)
│   └── ui/               # Componentes base (Button, Card, Input, etc.)
├── hooks/                # Custom hooks
├── lib/
│   ├── api/              # Camada de API (axios, endpoints)
│   ├── stores/           # Zustand stores
│   └── types/            # Tipos TypeScript
├── pages/                 # Componentes de página
└── styles/               # Estilos globais
```

## Camada de API

### Configuração Axios (`lib/api/axios.ts`)

O cliente Axios centralizado oferece:

- **Interceptadores de Request**: Adicionam token de autenticação automaticamente
- **Interceptadores de Response**: Tratam erros e retries automáticos
- **Tipos de Erro Customizados**:
  - `ApiError`: Erros HTTP (400-599)
  - `NetworkError`: Erros de rede
  - `ValidationError`: Erros de validação (422)

### Endpoints (`lib/api/endpoints.ts`)

Funções tipadas para chamadas de API:

```typescript
// Exemplo de uso
import { assetsApi } from '@/lib/api/endpoints';

const assets = await assetsApi.list({ status: 'ready', limit: 10 });
const asset = await assetsApi.get('uuid-here');
```

## Componentes de Feedback

### ErrorBoundary

Captura erros de React e exibe UI de fallback:

```tsx
import { ErrorBoundary } from '@/components/feedback';

<ErrorBoundary
  fallback={<div>Algo deu errado</div>}
>
  <MyComponent />
</ErrorBoundary>
```

### Spinner

Indicador de carregamento:

```tsx
import { Spinner } from '@/components/feedback';

<Spinner size="lg" variant="primary" />
```

### Skeleton

Placeholder de carregamento:

```tsx
import { Skeleton, SkeletonCard } from '@/components/feedback';

<SkeletonCard />
<Skeleton width={200} height={20} />
```

## Hooks Customizados

### useDebounce

Debounce para valores:

```tsx
const debouncedSearch = useDebounce(searchTerm, 300);
```

### useAsync

Gerenciamento de estado assíncrono:

```tsx
const { data, isLoading, isError, execute } = useAsync(fetchData);
```

### useMediaQuery

Responsividade:

```tsx
const isMobile = useIsMobile();
const isTablet = useTablet();
```

## Componentes UI

### Button

```tsx
<Button variant="primary" size="md" onClick={handleClick}>
  Salvar
</Button>
```

### Card

```tsx
<Card>
  <CardHeader> Título </CardHeader>
  <CardContent> Conteúdo </CardContent>
</Card>
```

### Table

```tsx
<Table>
  <TableHead>
    <TableRow>
      <TableHeaderCell>Coluna</TableHeaderCell>
    </TableRow>
  </TableHead>
  <TableBody>
    <TableRow>
      <TableCell>Dado</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

### Pagination

```tsx
<Pagination
  currentPage={page}
  totalPages={10}
  onPageChange={setPage}
/>
```

### Tabs

```tsx
<Tabs
  tabs={[
    { id: 'tab1', label: 'Tab 1' },
    { id: 'tab2', label: 'Tab 2' },
  ]}
  defaultTab="tab1"
  onChange={(id) => console.log(id)}
/>
```

## Performance

### Lazy Loading

Pages são carregadas sob demanda com React.lazy:

```tsx
const Dashboard = lazy(() => import('./pages/Dashboard.js'));
```

### Debounce

Busca e filtros usam debounce para evitar requests excessivos.

### React Query

Cache inteligente com staleTime configurado:

```tsx
staleTime: 5 * 60 * 1000, // 5 minutos
gcTime: 30 * 60 * 1000,  // 30 minutos
```

## Acessibilidade (WCAG 2.1)

### Padrões Implementados

- **Labels**: Todos os inputs têm labels associados
- **ARIA**: Atributos ARIA em componentes complexos
- **Foco**: Indicadores de foco visíveis
- **Keyboard**: Navegação completa por teclado
- **ARIA Live**: Regiões atualizadas announces para screen readers

### Exemplos

```tsx
// Botão com label
<Button aria-label="Excluir item">
  <TrashIcon />
</Button>

// Select acessível
<select aria-label="Selecione uma opção">
  <option>Opção 1</option>
</select>
```

## Gerenciamento de Estado

### Zustand (Client State)

```tsx
import { useUIStore } from '@/lib/store';

const sidebarOpen = useUIStore((state) => state.sidebarOpen);
```

### TanStack Query (Server State)

```tsx
import { useQuery } from '@tanstack/react-query';

const { data } = useQuery({
  queryKey: ['assets'],
  queryFn: fetchAssets,
});
```

## Convenções de Código

### Nomenclatura

- **Componentes**: PascalCase (`AssetCard`, `FilterBar`)
- **Hooks**: camelCase com prefixo `use` (`useDebounce`, `useAsync`)
- **Arquivos**: kebab-case (`filter-bar.tsx`, `api-client.ts`)

### Imports

```tsx
// Absolute imports para componentes internos
import { Button } from '@/components/ui';

// Relative imports para arquivos locais
import { formatDate } from '../utils';
```

## Executando o Projeto

```bash
# Instalar dependências
npm install

# Development
npm run dev

# Build
npm run build

# Preview do build
npm run preview
```

## Dependências Principais

| Dependência | Versão | Propósito |
|------------|--------|-----------|
| React | 18.3.1 | UI Library |
| TypeScript | 5.7.2 | Tipagem |
| React Router | 7.1.1 | Routing |
| TanStack Query | 5.62.11 | Data Fetching |
| Zustand | 5.0.2 | State Management |
| Tailwind CSS | 3.4.17 | Styling |
| Axios | 1.x | HTTP Client |
| Three.js | 0.171.0 | 3D Rendering |

## Contribuindo

1. Criar componentes em `components/ui/` para elementos base
2. Usar `cn()` utility para classes condicionais
3. Adicionar tipos para todos os props
4. Incluir testes para funcionalidades complexas
5. Seguir padrões de acessibilidade WCAG 2.1 AA
