import joinDaoFactory from '../../lib/src/joinDao.js'
import dfnsConfig from '../dfnsConfig.js'

const joinDao = joinDaoFactory(dfnsConfig)

export default async (interaction) => {
  //interaction.reply({ content: 'Join DAO command acknowledged' })
  await interaction.deferReply()
  
  joinDao(interaction.user.id)
    .then((wallet) => {
      interaction.editReply({ content: 'Your membership is being created. Check its status with the `/dao whami` command' })
    })
    .catch((error) => {
      console.error(error)
      interaction.editReply({ content: 'Error: ```' + error + '```' })
    })

}