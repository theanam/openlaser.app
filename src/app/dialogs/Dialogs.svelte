<script lang="ts">
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import VectorImportDialog from './VectorImportDialog.svelte';
  import ProfilesDialog from './ProfilesDialog.svelte';
  import PreferencesDialog from './PreferencesDialog.svelte';
  import ShortcutsDialog from './ShortcutsDialog.svelte';
  import PrintDialog from './PrintDialog.svelte';
  import DeviceSettingsDialog from './DeviceSettingsDialog.svelte';
  import SafetyChecklist from './SafetyChecklist.svelte';
  import MachineDetectDialog from './MachineDetectDialog.svelte';
  import TraceDialog from './TraceDialog.svelte';
  import ConnectHelpDialog from './ConnectHelpDialog.svelte';
</script>

<ErrorBoundary name="Import" compact><VectorImportDialog /></ErrorBoundary>
<ErrorBoundary name="Machine profiles" compact><ProfilesDialog /></ErrorBoundary>
<ErrorBoundary name="Preferences" compact><PreferencesDialog /></ErrorBoundary>
<ErrorBoundary name="Shortcuts" compact><ShortcutsDialog /></ErrorBoundary>
<ErrorBoundary name="Print" compact><PrintDialog /></ErrorBoundary>
<ErrorBoundary name="Device settings" compact><DeviceSettingsDialog /></ErrorBoundary>
<ErrorBoundary name="Safety checklist" compact><SafetyChecklist /></ErrorBoundary>
<ErrorBoundary name="Machine detection" compact><MachineDetectDialog /></ErrorBoundary>
<ErrorBoundary name="Trace" compact><TraceDialog /></ErrorBoundary>
<ErrorBoundary name="Connection help" compact><ConnectHelpDialog /></ErrorBoundary>
