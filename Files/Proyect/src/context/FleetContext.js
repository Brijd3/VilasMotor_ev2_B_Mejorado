import { createContext, useContext } from 'react';

export const FleetContext = createContext(null);
export const useFleet = () => useContext(FleetContext);
export { FleetProvider } from './FleetProvider.jsx';
