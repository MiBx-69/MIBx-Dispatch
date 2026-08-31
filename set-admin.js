import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function setAdmin() {
  const email = '786universes@gmail.com';
  const { data: usersData } = await supabase.auth.admin.listUsers();
  const user = usersData.users.find(u => u.email === email);
  if (!user) {
    console.error(`User with email ${email} not found.`);
    return;
  }
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('user_id', user.id);
  if (updateError) {
    console.error('Error updating profile:', updateError);
  } else {
    console.log('Successfully updated role to admin!');
  }
}

setAdmin();
