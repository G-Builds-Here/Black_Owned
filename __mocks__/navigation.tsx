export const Navigation = ({ onNavigate }: { onNavigate: (section: string) => void }) => (
  <nav data-testid="navigation" onClick={() => onNavigate('test')}>
    Navigation
  </nav>
);
