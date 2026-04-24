import SimpleMaterialsExplorer from '../components/explorers/SimpleMaterialsExplorer';
import { SIMPLE_EXPLORER_CONFIGS } from '../data/simpleExplorerConfigs';

const FlowBatteryMaterialsExplorer = () => (
  <SimpleMaterialsExplorer config={SIMPLE_EXPLORER_CONFIGS['flow-battery']} />
);

export default FlowBatteryMaterialsExplorer;
