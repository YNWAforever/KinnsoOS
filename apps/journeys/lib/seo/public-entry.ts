import type {Metadata} from 'next';
import {resolvePublicEntry} from '../../app/integration/public-entry-registry';
import type {EntryLocale} from '../../app/integration/public-entry-registry';
import {migrationRobots} from './migration-policy';
/** No approved canonical/translation mapping exists for retained notices yet. */
export function publicEntryMetadata(path:string,locale:EntryLocale):Metadata|null {
 const entry=resolvePublicEntry(path,locale,{creator:false,merchant:false,support:false});
 return entry?{title:entry.title,description:entry.body[0],robots:migrationRobots()}:null;
}
