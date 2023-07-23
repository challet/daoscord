import joinDaoUsersFactory from '../../lib/src/listDaoUsers.js'
import dfnsConfig from '../dfnsConfig.js'

const listDaoUsers = joinDaoUsersFactory(dfnsConfig)

export default async (interaction) => {
  await interaction.deferReply()

  listDaoUsers(interaction.user.id)
    .then((data) => {
      interaction.editReply({ 
        content: data.items
          .map(account => `* https://mumbai.polygonscan.com/address/${account.address}`)
          .join('\n')
        })
    })
    .catch((error) => {
      interaction.editReply({ content: 'Error: ```' + error + '```' })
    })
  

}