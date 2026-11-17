import upload from '../../api/upload-url';
import metadata from '../../api/file-metadata';
import download from '../../api/download-url';
import remove from '../../api/file-delete';
import control from '../../api/storage-control';
import {createBridge} from '../_lib/bridge';
export default createBridge({'upload-url':upload,'file-metadata':metadata,'download-url':download,'file-delete':remove,'storage-control':control});
