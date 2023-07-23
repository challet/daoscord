import readUSerFactory from '../../lib/src/readUser.js'
import dfnsConfig from '../dfnsConfig.js'

const readUser = readUSerFactory(dfnsConfig)

export default async (interaction) => {
  await interaction.deferReply()
  
  readUser(interaction.user.id)
    .then((data) => {
      interaction.editReply({ content: `Status ${data.status} since ${data.createdAt}.\n Your wallet is https://mumbai.polygonscan.com/address/${data.address}. You have ${data.balance} voting power` })
    })
    .catch((error) => {
      interaction.editReply({ content: 'Error: ```' + error + '```' })
    })

}