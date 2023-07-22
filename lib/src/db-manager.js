import {Low, Memory} from 'lowdb'
import axios from "axios";
import {Web3Storage} from "web3.storage";
import {CronJob} from "cron";

let db = null;

const saveDb = async (web3Token) => {
    if(!db) return
    try {
        await db.read()

        console.log('Create files...')
        const files = [new File(
            [Buffer.from(JSON.stringify(db.data))],
            `${new Date().toDateString()}.json`
        )]
        console.log('Create files done.')

        console.log('Upload new backup to IPFS...')
        const ipfsClient = new Web3Storage({token: web3Token})
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

export const createDb = async (web3Token) => {
    try {
        db = new Low(new Memory())
        await db.read()
        db.data = (await retrieveFromIPFS(web3Token, false)) || { proposals: [] }
        await db.write()
        return db
    } catch (e) {
        console.error(e)
        return null
    }
}

const retrieveFromIPFS = async (web3Token, lastUploadIsCorrupted) => {
    try {
        const lastUploadCid = await retrieveLastUploadCid(web3Token, lastUploadIsCorrupted)
        console.log('Fetch all files...')
        if (lastUploadIsCorrupted) {
            console.warn(`Last upload is corrupted. We will then use penultimate upload ${lastUploadCid} !`)
        }
        const ipfsClient = new Web3Storage({token: web3Token})
        let res = null
        if(lastUploadCid) {
            res = await ipfsClient.get(lastUploadCid)?.catch((e) => {
                console.error(e);
                return {ok: false};
            });
        }  else {
            //Do nothing, there are no previous uploads
            return
        }
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
            await retrieveFromIPFS(web3Token, true)
        } else {
            await new Promise((resolve) => setTimeout(resolve, 5000))
            await retrieveFromIPFS(web3Token, false)
        }
        return null

    }
}

const retrieveLastUploadCid = async (web3Token, lastUploadIsCorrupted) => {
    console.log('Fetch last directory...')
    let lastUpload = null
    const size = lastUploadIsCorrupted ? 2 : 1
    try {
        const headers = {
            'Authorization': `Bearer ${web3Token}`
        }
        const res = await axios(`https://api.web3.storage/user/uploads?size=${size}`, {headers})
        lastUpload = res.data
    } catch (e) {
        console.log('Fetch last directory failed.')
        if (!lastUpload || lastUpload.length < size) throw Error('Fetch last directory failed.')
    }
    console.log('Fetch last directory done.')
    if(!lastUpload || !lastUpload.length) {
        return null;
    }
    console.log(lastUpload)
    return lastUpload[size - 1].cid;
}

new CronJob(
    '0 */5 * * * *',
    saveDb,
    null,
    true,
    'America/Los_Angeles'
);

export const getDb = () => {
    return db
}