import readUSerFactory from '../../lib/src/readUser.js'
import dfnsConfig from '../dfnsConfig.js'

const readUser = readUSerFactory(dfnsConfig)

export default async (interaction, daoClient) => {
  await interaction.deferReply()

  await 
  
  daoClient.createDao()
    .then((address) => {
      interaction.editReply({ content: `DAO deployed on https://mumbai.polygonscan.com/address/${address}` })
    })
    .catch((error) => {
      interaction.editReply({ content: 'Error: ```' + error + '```' })
    })

}