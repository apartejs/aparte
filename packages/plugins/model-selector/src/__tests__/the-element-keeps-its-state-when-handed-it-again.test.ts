/**
 * `<aparte-model-selector>` held to the contract every manifest's elements keep (core's
 * `element-contract.ts`): an attribute written again with its own value draws nothing again.
 */
import '../index.js';
import { describeElementContract, manifestOf } from '../../../../core/src/__tests__/element-contract.js';

describeElementContract(manifestOf('packages/plugins/model-selector'));
