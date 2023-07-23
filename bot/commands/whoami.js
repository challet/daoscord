import readUSerFactory from '../../lib/src/readUser.js'
import dfnsConfig from '../dfnsConfig.js'

const readUser = readUSerFactory(dfnsConfig)

export default async (interaction) => {
  await interaction.deferReply()
  
  readUser(interaction.user.id)
    .then((data) => {
      interaction.editReply({ content: `Status ${data.status} since ${data.dateCreated}.\n Your wallet is https://mumbai.polygonscan.com/address/${data.address}.\n You have **${data.balance.toString()}** voting power.` })
    })
    .catch((error) => {
      interaction.editReply({ content: 'Error: ```' + error + '```' })
    })

}