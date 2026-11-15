/**
 * `<aparte-ask-user>` held to the contract every manifest's elements keep (core's
 * `element-contract.ts`): a property handed again with its own value changes nothing the person
 * sees.
 */
import './index.js';
import { describeElementContract, manifestOf } from '../../../core/src/__tests__/element-contract.js';

describeElementContract(manifestOf('packages/plugins/ask-user'));
