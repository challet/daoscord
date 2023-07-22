import {Low, Memory} from 'lowdb'
import axios from "axios";
import {Web3Storage} from "web3.storage";
import {CronJob} from "cron";

export declare type DatabaseSchema = {
    guildUuid?: string;
    daoAddress?: string;
    tokenVotingPluginAddress?: string;
    proposals: Array<{
        proposalId: string;
        metadataUri: string;
    }>
};

const ipfsClient = new Web3Storage({token: process.env.DAOSCORD_WEB3_TOKEN})

const db: Low<DatabaseSchema> = null;

const saveDb = async () => {
    try {
        await db.read()

        console.log('Create files...')
        const files = [new File(
            [Buffer.from(JSON.stringify(db.data))],
            `${db.data.guildUuid}.json`
        )]
        console.log('Create files done.')

        console.log('Upload new backup to IPFS...')
        const cid = await ipfsClient
            ?.put(files)
            ?.catch((e) => console.error(e));
        if (!cid) console.error('Upload new backup to IPFS failed')
        else console.log('Upload new backup to IPFS done.')

        return true
    } catch (e) {
        console.error(e)
        return false
    }
}

const createDb = async () => {
    try {
        const db: Low<DatabaseSchema> = new Low(new Memory())
        await db.read()
        db.data = {
            proposals: []
        }
        await db.write()
        return db
    } catch (e) {
        console.error(e)
        return null
    }
}

const retrieveFromIPFS = async (lastUploadIsCorrupted): Promise<DatabaseSchema> => {
    try {
        const lastUploadCid = await retrieveLastUploadCid(lastUploadIsCorrupted)
        console.log('Fetch all files...')
        if (lastUploadIsCorrupted) {
            console.warn(`Last upload is corrupted. We will then use penultimate upload ${lastUploadCid} !`)
        }
        let res = await ipfsClient.get(lastUploadCid)?.catch((e) => {
            console.error(e);
            return {ok: false};
        });
        if (!res || !res?.ok) throw Error('Failed to fetch files.')
        console.log('Fetch all files done.')

        console.log('Process all files...')
        if (!("files" in res)) {
            throw Error('Failed to load files.')
        }
        const files = await res.files()
        return JSON.parse(await files[0].text())
    } catch (e) {
        console.error(e)
        if (e.message?.includes('Unexpected end of data')) {
            await retrieveFromIPFS(true)
        } else {
            await new Promise((resolve) => setTimeout(resolve, 5000))
            await retrieveFromIPFS(false)
        }
        return null

    }
}

const retrieveLastUploadCid = async (lastUploadIsCorrupted: boolean) => {
    console.log('Fetch last directory...')
    let lastUpload = null
    const size = lastUploadIsCorrupted ? 2 : 1
    try {
        const headers = {
            'Authorization': `Bearer ${process.env.WEB3_TOKEN}`
        }
        const res = await axios(`https://api.web3.storage/user/uploads?size=${size}`, {headers})
        lastUpload = res.data
    } catch (e) {
        console.log('Fetch last directory failed.')
    }
    if (!lastUpload || lastUpload.length < size) throw Error('Fetch last directory failed.')
    console.log('Fetch last directory done.')
    return lastUpload[size - 1].cid;
}

new CronJob(
    '0 */5 * * * *',
    saveDb,
    null,
    true,
    'America/Los_Angeles'
);

export const getDb = async (): Promise<Low<DatabaseSchema>> => {
    if (!db) {
        await createDb()
        db.data = await retrieveFromIPFS(false)
        await db.write()
    }
    return db
}