import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { DiveComputerNative } from '../native';
import { addDiveComputerListener } from '../native/events';
import { parseShearwaterModel, verificationTier, type ShearwaterModel } from '@divechef/shared';
import { tokens } from '../theme';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { VerificationBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { useActiveDevice } from '../contexts/DeviceContext';
import { useAuth } from '../hooks/useAuth';
import { registerDevice } from '../services/devices';

const SERVICE_UUID = 'FE25C237-0ECE-443C-B0AA-E02033E7029D';

type Step = 'pick' | 'scanning' | 'confirm' | 'connecting' | 'registering' | 'done' | 'error';

const PICKER_MODELS: ShearwaterModel[] = [
  'peregrine', 'perdix', 'perdix-ai', 'perdix-2',
  'petrel-2', 'petrel-3', 'teric', 'nerd-2', 'tern',
  'unknown-shearwater',
];

const MODEL_LABEL: Record<ShearwaterModel, string> = {
  peregrine: 'Peregrine',
  perdix: 'Perdix',
  'perdix-ai': 'Perdix AI',
  'perdix-2': 'Perdix 2',
  'petrel-2': 'Petrel 2',
  'petrel-3': 'Petrel 3',
  teric: 'Teric',
  'nerd-2': 'Nerd 2',
  tern: 'Tern',
  'unknown-shearwater': 'Other Shearwater (let us know)',
};

export default function AddDeviceScreen() {
  const nav = useNavigation();
  const { user } = useAuth();
  const { addDevice } = useActiveDevice();
  const [step, setStep] = useState<Step>('pick');
  const [pickedModel, setPickedModel] = useState<ShearwaterModel | null>(null);
  const [discovered, setDiscovered] = useState<{ identifier: string; name: string; parsed: ShearwaterModel | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const proceedConnect = useCallback(async (identifier: string, finalModel: ShearwaterModel) => {
    setStep('connecting');
    try {
      await DiveComputerNative.connect(identifier);
      const info = await DiveComputerNative.getDeviceInfo();
      setStep('registering');
      const friendlyName = user?.displayName
        ? `${user.displayName}'s ${MODEL_LABEL[finalModel]}`
        : MODEL_LABEL[finalModel];
      const device = await registerDevice({
        model: finalModel,
        serialNumber: info.serial,
        scanName: info.scanName ?? null,
        firmwareVersion: info.firmwareVersion ?? null,
        friendlyName,
      });
      addDevice(device);
      setStep('done');
      setTimeout(() => nav.goBack(), 800);
    } catch {
      setError("Could not connect to your device. Make sure it's awake and Bluetooth is on.");
      setStep('error');
    } finally {
      try { await DiveComputerNative.disconnect(); } catch { /* noop */ }
    }
  }, [user, addDevice, nav]);

  useEffect(() => {
    if (step !== 'scanning' || !pickedModel) return;
    const unsub = addDiveComputerListener('diveComputerDiscovered', (d: { identifier: string; name?: string | null }) => {
      const name = d.name ?? '';
      const parsed = parseShearwaterModel(name);
      setDiscovered({ identifier: d.identifier, name, parsed });
      DiveComputerNative.stopScan().catch(() => {});

      const isMismatch = parsed != null && pickedModel !== 'unknown-shearwater' && parsed !== pickedModel;
      const isUnknownUpgrade = pickedModel === 'unknown-shearwater' && parsed != null;

      if (isMismatch || isUnknownUpgrade) {
        setStep('confirm');
      } else {
        proceedConnect(d.identifier, pickedModel);
      }
    });
    DiveComputerNative.startScan(SERVICE_UUID).catch(() => {
      setError('Bluetooth scan failed. Check that Bluetooth and location are enabled.');
      setStep('error');
    });
    return () => { unsub(); DiveComputerNative.stopScan().catch(() => {}); };
  }, [step, pickedModel, proceedConnect]);

  const onPickModel = (m: ShearwaterModel) => {
    setPickedModel(m);
    setStep('scanning');
  };

  const onConfirmKeepPicked = () => {
    if (!discovered || !pickedModel) return;
    proceedConnect(discovered.identifier, pickedModel);
  };

  const onConfirmUseParsed = () => {
    if (!discovered || !discovered.parsed) return;
    proceedConnect(discovered.identifier, discovered.parsed);
  };

  const onRetry = () => { setError(null); setStep('pick'); setDiscovered(null); };

  if (step === 'pick') {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Add a dive computer</Text>
        <Text style={styles.subtitle}>Pick your model. We'll scan for it next.</Text>
        {PICKER_MODELS.map((m) => (
          <Pressable key={m} onPress={() => onPickModel(m)} style={styles.row} testID={`model-${m}`}>
            <Card style={styles.rowCard}>
              <View style={styles.rowInner}>
                <Text style={styles.rowLabel}>{MODEL_LABEL[m]}</Text>
                <VerificationBadge tier={verificationTier(m)} />
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  if (step === 'scanning') {
    return (
      <View style={[styles.screen, styles.center]}>
        <Spinner />
        <Text style={styles.statusText}>Looking for your {MODEL_LABEL[pickedModel!]}…</Text>
        <Text style={styles.hint}>Make sure your dive computer is awake and Bluetooth is on.</Text>
      </View>
    );
  }

  if (step === 'confirm' && discovered && pickedModel) {
    const parsedLabel = discovered.parsed ? MODEL_LABEL[discovered.parsed] : 'an unknown Shearwater';
    const isUnknownUpgrade = pickedModel === 'unknown-shearwater' && discovered.parsed != null;
    return (
      <View style={[styles.screen, styles.center]}>
        <Card style={styles.confirmCard}>
          <Text style={styles.title}>
            {isUnknownUpgrade ? 'We recognized your computer' : "Hmm, that doesn't match"}
          </Text>
          <Text style={styles.subtitle}>
            {isUnknownUpgrade
              ? `It advertises as ${parsedLabel}. Use that?`
              : `You picked ${MODEL_LABEL[pickedModel]} but this device advertises as ${parsedLabel}. Which is correct?`}
          </Text>
          {discovered.parsed && (
            <Button label={`Use ${parsedLabel}`} onPress={onConfirmUseParsed} testID="confirm-use-parsed" />
          )}
          <View style={{ height: tokens.space[2] }} />
          <Button label={`Keep ${MODEL_LABEL[pickedModel]}`} variant="ghost" onPress={onConfirmKeepPicked} testID="confirm-keep-picked" />
        </Card>
      </View>
    );
  }

  if (step === 'connecting' || step === 'registering') {
    return (
      <View style={[styles.screen, styles.center]}>
        <Spinner />
        <Text style={styles.statusText}>
          {step === 'connecting' ? 'Connecting…' : 'Registering your device…'}
        </Text>
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.doneText}>Device added.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, styles.center]}>
      <EmptyState
        icon="⚠️"
        title="Something went wrong"
        body={error ?? 'Please try again.'}
        ctaLabel="Try again"
        onCtaPress={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bgBase },
  content: { padding: tokens.space[4] },
  center: { alignItems: 'center', justifyContent: 'center', padding: tokens.space[4] },
  title: { color: tokens.color.text, fontSize: 24, fontWeight: '700', marginBottom: tokens.space[2] },
  subtitle: { color: tokens.color.text2, fontSize: 15, marginBottom: tokens.space[4] },
  row: { marginBottom: tokens.space[2] },
  rowCard: {},
  rowInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { color: tokens.color.text, fontSize: 16, fontWeight: '600' },
  statusText: { color: tokens.color.text, fontSize: 16, marginTop: tokens.space[3] },
  hint: { color: tokens.color.text3, fontSize: 13, textAlign: 'center', marginTop: tokens.space[2] },
  confirmCard: { padding: tokens.space[4] },
  doneText: { color: tokens.color.success, fontSize: 18, fontWeight: '700' },
});
