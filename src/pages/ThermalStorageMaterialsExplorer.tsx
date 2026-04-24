import SimpleMaterialsExplorer from '../components/explorers/SimpleMaterialsExplorer';
import { SIMPLE_EXPLORER_CONFIGS } from '../data/simpleExplorerConfigs';

const ThermalStorageMaterialsExplorer = () => (
  <SimpleMaterialsExplorer config={SIMPLE_EXPLORER_CONFIGS['thermal-storage']} />
);

export default ThermalStorageMaterialsExplorer;
