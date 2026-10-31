// Here, many modules required by the server and client are imported - not just the ones actually used here!
import Executor from './Executor.js';
import JsonFX from './JsonFX.js';
import Regex from './Regex.js';
import Server from './Server.js';
import Sorting from './Sorting.js';
import Utilities from './Utilities.js';
import Client from './Client.js';
import Core from './Core.js';
import HashLists from './HashLists.js';
import Mathematics from './Mathematics.js';
import ADS from './ADS.js';
import ADS_PLC_Diagnoses from './ADS_PLC_Diagnoses.js';
import ADS_PLC_ItemInfo from './ADS_PLC_ItemInfo.js';
import ADS_PLC_Processes from './ADS_PLC_Processes.js';
import Common from './Common.js';
import OPCUA from './OPCUA.js';
import SqlHelper from './SqlHelper.js';
import ObjectLifecycleManager from './ObjectLifecycleManager.js';
import Access from './Access.js';
import Logger from './Logger.js';
import ContentManager from './ContentManager.js';

const Evaluate = {};
const isNodeJS = typeof process !== 'undefined' && Boolean(process.versions?.node);
const md5 = isNodeJS ? {} : undefined;
const fs = isNodeJS ? await import('node:fs') : undefined;
/*  Note: This eval function must be defined here!
    When tasks on server side must be executed, they will be loaded from the database as text and then evaluated to get the executable task object.
    The evaluated text possibly references modules in js_utils.
    Keep this function in this module so its statically imported bindings remain visible to evaluated source.
    The same function is used by ContentManager, whose module scope would not expose these bindings. */
Evaluate.evalFunc = x => eval(`(${x})`);
// TODO: response = eval ('(' + JsonFX.stringify(response, true) + ')\n//# sourceURL=' + match[1] + '.js');

export default Evaluate;
